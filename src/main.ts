import * as utils from "@iobroker/adapter-core";
import { Mk2DataEntry } from "./mk2/mk2Model";
import { Mk2Protocol } from "./mk2/mk2Protocol";
import { isStableState, controlAllowedWhileOff } from "./lib/state-gate";
import { shouldHandleControlState } from "./lib/control-rules";
import { processControlWrites, QueueItem } from "./lib/send-queue";
import { buildStateObject, objectDefinitionChanged } from "./lib/state-objects";
import { publishModel } from "./lib/publish";
import { PollLoop } from "./lib/poll-loop";

export function splitIdFromAdapter(str: string): string {
	const delimiter = ".";
	const start = 2;
	const tokens = str.split(delimiter).slice(start);
	return tokens.join(delimiter);
}

class VictronMk2 extends utils.Adapter {
	mk2: Mk2Protocol | undefined;
	private pollLoop: PollLoop | undefined;
	toSendQueue: QueueItem[] = [];
	private assistLimitObjectMax: number | null = null;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "victron-mk2",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	private async onReady(): Promise<void> {
		try {
			await this.startAdapter();
		} catch (error) {
			// Never leave an unhandled rejection or a crash/restart loop (N1).
			const message = error instanceof Error ? error.message : String(error);
			this.log.error("onReady failed: " + message);
			try {
				await this.setStateAsync("info.connection", { val: false, ack: true });
			} catch {
				// even the state write may fail in this situation
			}
		}
	}

	private async startAdapter(): Promise<void> {
		const interval = Number(this.config.interval);
		this.config.interval = Number.isFinite(interval) && interval >= 1 ? interval : 2;
		this.log.info("config interval: " + this.config.interval);
		this.log.info("config portPath: " + this.config.portPath);

		this.mk2 = new Mk2Protocol(this.config.portPath, this.log);
		const responseTimeout = Number(this.config.responseTimeout);
		if (Number.isFinite(responseTimeout) && responseTimeout >= 250) {
			this.mk2.conn.responseTimeoutMs = responseTimeout;
			this.log.info("config responseTimeout: " + responseTimeout + " ms");
		}
		// Create the objects even without a configured port and report "not
		// connected", instead of leaving no state at all (review N6).
		await this.initObjects();
		// Nothing is connected yet at startup; never keep a persisted true (N2).
		await this.setStateAsync("info.connection", { val: false, ack: true });
		if (!this.config.portPath) {
			this.log.error("config portPath is empty; adapter will not poll until it is configured");
			await this.setStateAsync("info.connection", { val: false, ack: true });
			return;
		}
		this.mainLoop();
		this.subscribeStates("control.*");
	}

	private async onUnload(callback: () => void): Promise<void> {
		// Wait for the running poll/control iteration before closing the port,
		// otherwise a write can still be in flight during shutdown (review T12).
		if (this.pollLoop) {
			await this.pollLoop.stop(3000);
		}
		try {
			await this.mk2?.conn.port.close();
		} catch {
			// ignore close errors during shutdown
		}
		callback();
	}

	private async initObjects(): Promise<void> {
		if (!this.mk2) return;
		for (const [key, value] of Object.entries(this.mk2.mk2Model)) {
			const object = buildStateObject(key, value as Mk2DataEntry);
			const existing = await this.getObjectAsync(key);
			if (!existing) {
				await this.setObjectNotExistsAsync(key, object);
			} else if (objectDefinitionChanged(existing, object)) {
				// Upgrade roles/descriptions/units/state maps on existing objects;
				// extendObject keeps user customisation such as InfluxDB history.
				await this.extendObjectAsync(key, object);
			}
		}
	}

	/** Keep control.set_assist's limits in sync with the discovered device. */
	private async updateAssistLimitObject(): Promise<void> {
		if (!this.mk2) return;
		const max = this.mk2.mk2Model["assist.maxlimit"].value;
		if (typeof max != "number" || max <= 0 || max === this.assistLimitObjectMax) return;
		this.assistLimitObjectMax = max;
		await this.extendObjectAsync("control.set_assist", {
			common: { min: 0, max, def: max },
		});
	}

	private mainLoop(): void {
		// Idempotent: a second ready event must never orphan a running loop (N8).
		if (this.pollLoop) {
			return;
		}
		this.pollLoop = new PollLoop(() => this.updateStates(), this.config.interval * 1000);
		this.pollLoop.start(10 * 1000);
	}

	private async updateStates(): Promise<void> {
		try {
			if (!this.mk2) return;

			// Read-only state poll first. While the MultiPlus is booting or off
			// (state 10/20) no control command and no full poll is sent.
			await this.mk2.pollStateOnly();
			// Publish the state poll as well: an Off or a boot loop must be visible
			// in ioBroker and to the watchdog, not just the last stable state.
			await this.publishStates(["state.state", "state.substate", "info.address"]);
			await this.setStateAsync("info.connection", { val: true, ack: true });
			const state = this.mk2.mk2Model["state.state"].value;
			if (!isStableState(state)) {
				this.log.debug("MultiPlus not stable yet (state " + state + "), deferring control writes");
				return;
			}

			if (state === 20) {
				// Off must not become a one-way state (review H2): only the explicit
				// power-on controls are forwarded, everything else is dropped.
				const before = this.toSendQueue.length;
				this.toSendQueue = this.toSendQueue.filter((item) => controlAllowedWhileOff(item.name));
				if (this.toSendQueue.length !== before) {
					this.log.warn("device is Off: only switch_state/grid_mode writes are allowed, other control writes dropped");
				}
			}

			await this.processToSendQueue();
			await this.mk2.poll();
			await this.publishStates();
			await this.updateAssistLimitObject();
		} catch (Exception) {
			// JSON.stringify(Error) yields "{}", so log the message and stack.
			const message = Exception instanceof Error ? (Exception.stack ?? Exception.message) : JSON.stringify(Exception);
			this.log.error("ERROR updateStates : " + message);
			// Publish the lost connection as a state, not only as a log line.
			try {
				await this.setStateAsync("info.connection", { val: false, ack: true });
				if (this.mk2) {
					await this.setStateAsync("diag.timeouts", { val: this.mk2.conn.timeouts, ack: true });
					await this.setStateAsync("diag.checksum_errors", { val: this.mk2.conn.checksumErrors, ack: true });
					await this.setStateAsync("diag.last_error", { val: this.mk2.conn.lastError, ack: true });
				}
			} catch {
				// ignore secondary state errors while handling a failure
			}
		}
	}

	private async publishStates(only?: string[]): Promise<void> {
		if (!this.mk2) return;
		await publishModel(this.mk2.mk2Model, async (key, value) => {
			await this.setStateAsync(key, { val: value, ack: true });
		}, only);
	}

	async processToSendQueue(): Promise<void> {
		if (!this.mk2) return;
		const completed = await processControlWrites(this.mk2, this.toSendQueue, this.log);
		for (const item of completed) {
			// Acknowledge successful writes; ack=true is never forwarded again, so
			// this cannot retrigger the control path (review T7).
			await this.setStateAsync(item.name, { val: item.value, ack: true });
		}
	}

	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (!state) {
			this.log.info(`state ${id} deleted`);
			return;
		}

		const idShort = splitIdFromAdapter(id);
		if (shouldHandleControlState(idShort, state) && this.mk2) {
			this.log.debug(`control ${id} -> MK2 value ${state.val}`);
			this.toSendQueue.push({
				name: idShort,
				value: state.val as number,
				attempts: 0,
				ts: Date.now(),
			});
		}
	}
}

if (require.main !== module) {
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new VictronMk2(options);
} else {
	(() => new VictronMk2())();
}
