import * as utils from "@iobroker/adapter-core";
import { Mk2DataEntry } from "./mk2/mk2Model";
import { Mk2Protocol } from "./mk2/mk2Protocol";
import { isStableState } from "./lib/state-gate";
import { shouldHandleControlState } from "./lib/control-rules";
import { processToSendQueue, QueueItem } from "./lib/send-queue";
import { buildStateObject } from "./lib/state-objects";
import { selectStatesToPublish } from "./lib/publish";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function splitIdFromAdapter(str: string): string {
	const delimiter = ".";
	const start = 2;
	const tokens = str.split(delimiter).slice(start);
	return tokens.join(delimiter);
}

class VictronMk2 extends utils.Adapter {
	mk2: Mk2Protocol | undefined;
	mainLoopRunning = true;
	toSendQueue: QueueItem[] = [];

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
		const interval = Number(this.config.interval);
		this.config.interval = Number.isFinite(interval) && interval >= 1 ? interval : 2;
		if (!this.config.portPath) {
			this.log.error("config portPath is empty; adapter will not poll until it is configured");
			return;
		}
		this.log.info("config interval: " + this.config.interval);
		this.log.info("config portPath: " + this.config.portPath);

		this.mk2 = new Mk2Protocol(this.config.portPath, this.log);
		const responseTimeout = Number(this.config.responseTimeout);
		if (Number.isFinite(responseTimeout) && responseTimeout >= 250) {
			this.mk2.conn.responseTimeoutMs = responseTimeout;
			this.log.info("config responseTimeout: " + responseTimeout + " ms");
		}
		await this.initObjects();
		this.mainLoop();
		this.subscribeStates("control.*");
	}

	private async onUnload(callback: () => void): Promise<void> {
		this.mainLoopRunning = false;
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
			await this.setObjectNotExistsAsync(key, buildStateObject(key, value as Mk2DataEntry));
		}
	}

	private async mainLoop(): Promise<void> {
		this.setTimeout(async () => {
			while (this.mainLoopRunning) {
				await this.updateStates();
				await sleep(this.config.interval * 1000);
			}
		}, 10 * 1000);
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

			await this.processToSendQueue();
			await this.mk2.poll();
			await this.publishStates();
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
		for (const key of selectStatesToPublish(this.mk2.mk2Model, only)) {
			const entry = this.mk2.mk2Model[key];
			await this.setStateAsync(key, {
				val: entry.value,
				ack: true,
			});
		}
	}

	async processToSendQueue(): Promise<void> {
		if (!this.mk2) return;
		await processToSendQueue(this.mk2, this.toSendQueue, this.log);
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
			});
		}
	}
}

if (require.main !== module) {
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new VictronMk2(options);
} else {
	(() => new VictronMk2())();
}
