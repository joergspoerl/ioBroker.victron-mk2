import { Mk2Connection } from "./mk2Connection";
import { led, Mk2Model } from "./mk2Model";
import {
	FLAGS1,
	flags1Bit,
	READONLY_SETTINGS,
	SettingInfo,
	SettingInfoCollector,
	settingDisplayValue,
	settingRawValue,
} from "./mk2Settings";
import {
	formatDeviceVersion,
	makeRamInfo,
	ramDisplayValue,
	RamInfo,
	ramScale,
} from "./mk2Ram";
import { switchStateFromRegister } from "./mk2Switch";
import * as bp from "bufferpack";
import { Mk2ReadbackError, Mk2TransportError, Mk2ValidationError } from "../lib/errors";

export interface IscaleEntry {
	scale: number
	offset: number
}

export class Calc {
	umains_calc: IscaleEntry | undefined
	imains_calc: IscaleEntry | undefined
	uinv_calc: IscaleEntry | undefined
	iinv_calc: IscaleEntry | undefined
	ubat_calc: IscaleEntry | undefined
	ibat_calc: IscaleEntry | undefined
	finv_calc: IscaleEntry | undefined
	fmains_calc: IscaleEntry | undefined

}

function scale (factor: number): number {
	return ramScale(factor)
}
function round(number: number, decimal: number): number {
	const e = Math.pow(10, decimal)
	return Math.round(number * e) / e
}


const FLAGS0_KEYS: Record<number, string> = {
	0: "setting.flag.MultiPhaseSystem",
	1: "setting.flag.MultiPhaseLeader",
	2: "setting.flag.Freq60Hz",
	3: "setting.flag.DisableWaveCheck",
	4: "setting.flag.DoNotStopAfter10HrBulk",
	5: "setting.flag.AssistEnabled",
	6: "setting.flag.DisableCharge",
	7: "setting.flag.WaveCheckInverted",
	8: "setting.flag.DisableAES",
	11: "setting.flag.EnableReducedFloat",
	13: "setting.flag.DisableGroundRelay",
	14: "setting.flag.WeakACInput",
	15: "setting.flag.RemoteOverrulesAC2",
};

export class Mk2Protocol {
	portPath: string
	conn: Mk2Connection
	mk2Model: Mk2Model = new Mk2Model()
	calc: Calc;
	log: ioBroker.Logger;
	/** Current VE.Bus switch state used for S commands (default: On). */
	currentSwitchState = 3;
	/** Cached CommandGetSettingInfo answers, keyed by setting id. */
	settingInfoCache = new Map<number, SettingInfo>();
	private extendedSettingsLoaded = false;
	private failedExtendedSettings = new Set<number>();
	private unsupportedScalings = new Set<keyof Calc>();
	private ramInfoCache = new Map<number, RamInfo>();
	private unsupportedRam = new Set<number>();
	private deviceInfoLoaded = false;
	private longWinmonFrames = false;
	private shortWinmonForWrites = false;
	private connectionGeneration = -1;

	/**
	 * Drop all connection-derived caches when the MK2 resynchronised (review
	 * T15): after a reconnect or a device replacement, scalings, setting ranges,
	 * RAM support and the device identification may all be different.
	 */
	private checkConnectionGeneration(): void {
		if (this.conn.generation === this.connectionGeneration) {
			return;
		}
		this.connectionGeneration = this.conn.generation;
		this.calc = new Calc();
		this.settingInfoCache.clear();
		this.ramInfoCache.clear();
		this.unsupportedRam.clear();
		this.deviceInfoLoaded = false;
		this.longWinmonFrames = false;
		this.shortWinmonForWrites = false;
		this.extendedSettingsLoaded = false;
		this.failedExtendedSettings.clear();
		this.unsupportedScalings.clear();
		this.log.debug("new MK2 sync generation, cached metadata reset");
	}

	constructor(portPath: string, log: ioBroker.Logger, conn?: Mk2Connection) {
		this.portPath = portPath;
		this.conn = conn ?? new Mk2Connection(portPath, log);
		this.calc = new Calc();
		this.log = log;
	}
	async poll(): Promise<void> {
		try {
			await this.conn.ensureSynced()
			this.checkConnectionGeneration()
			await this.address()
			await this.optionalStep("device identification", () => this.loadDeviceInfo())
			await this.loadScalingsIfNeeded()
			await this.led_status()
			await this.get_state()
			await this.master_multi_led_info()
			await this.dc_info()
			await this.ac_info()
			await this.optionalStep("RAM telemetry", () => this.readRamTelemetry())
			await this.get_setting_IBatBulk()
			await this.get_flags()
			await this.get_flags1()
			await this.optionalStep("extended settings", () => this.loadExtendedSettings())
			this.mk2Model["info.connection"].value = true

		} catch (Exception) {
			this.mk2Model["info.connection"].value = false
			this.log.error("Exception in poll " + (Exception instanceof Error ? Exception.message : JSON.stringify(Exception)))
		} finally {
			this.updateDiagnostics()
		}

	}

	/**
	 * Optional feature blocks must not abort the whole poll: firmware without a
	 * given RAM variable or setting is normal, not a connection failure.
	 */
	private async optionalStep(name: string, fn: () => Promise<void>): Promise<void> {
		try {
			await fn()
		} catch (error) {
			// Only feature-level failures are optional. A transport error means the
			// connection is gone and must reach poll()'s failure path (review T6).
			if (error instanceof Mk2TransportError) {
				throw error
			}
			this.log.warn(`optional step "${name}" failed: ${error instanceof Error ? error.message : error}`)
		}
	}

	/** Mirror the connection health counters into the model (issue #8). */
	private updateDiagnostics(): void {
		this.mk2Model["diag.timeouts"].value = this.conn.timeouts ?? 0
		this.mk2Model["diag.checksum_errors"].value = this.conn.checksumErrors ?? 0
		this.mk2Model["diag.last_error"].value = this.conn.lastError ?? ""
		this.mk2Model["diag.protocol_errors"].value = this.conn.protocolErrors ?? 0
		this.mk2Model["diag.sync_errors"].value = this.conn.syncErrors ?? 0
	}

	/**
	 * Minimal, read-only poll used to determine whether the MultiPlus has
	 * finished booting before any control command is sent.
	 */
	async pollStateOnly(): Promise<void> {
		await this.conn.ensureSynced()
		this.checkConnectionGeneration()
		await this.address()
		await this.get_state()
		// Successful exchange: connected. The full poll owns the failure case.
		this.mk2Model["info.connection"].value = true
	}

	checksum(buffer: Buffer): boolean {
		let sum = 0;
		for (let i = 0; i < buffer.length; i++) {
			sum = sum + buffer[i]
		}
		const check = sum % 256;
		//this.log.debug("checksum",check)
		return check == 0 ? true : false;
	}


	create_frame(command: any, data: any): Buffer {
		const len = command.length + data.length + 1;
		let buf = Buffer.from([len, [0xFF]]);
		buf = Buffer.concat([buf, Buffer.from(command)]);
		buf = Buffer.concat([buf, Buffer.from(data)]);

		let sum = 0;
		for (let i = 0; i < buf.length; i++) {
			sum = sum + buf[i]
		}

		sum = 256 - sum % 256;
		buf = Buffer.concat([buf, Buffer.from([sum])]);

		//    this.log.debug("SEND -> ", buf, buf.toString(), 'checksum',sum);
		// this.conn.frame_debug("SEND ->", buf);

		return buf;

	}

	async address(): Promise<void> {
		this.log.debug("******   adress");

		return this.conn.communicate(this.create_frame("A", "\x01\x00"), async (response: Buffer): Promise<void> => {

			if (response[0] < 0x04 || response[1] != 0xff || response[2] != 0x41 || response[3] != 0x01 ) {
				throw new Error("no address frame")
			}
			// The reply carries the address currently used by the MK2 (§7.1).
			this.mk2Model["info.address"].value = response[4];
		})
	}


	async led_status() : Promise<void> {
		this.log.debug("******   led_status");

		return this.conn.communicate(this.create_frame("L", ""), async (response: Buffer) => {

			// §4 note b: MK2 >= 1130128 omits the trailing 0x00, so the response can
			// be as short as 4 (length, marker, on, blink) plus checksum.
			if (response[0] < 0x04 || response[1] != 0xff || response[2] != 0x4c ) {
				throw new Error("no led_status frame")
			}

			const led_status = response[3];
			const led_blink  = response[4];

			let mains      = led.UNKNOWN
			let absorption = led.UNKNOWN
			let bulk       = led.UNKNOWN
			let float      = led.UNKNOWN
			let inverter   = led.UNKNOWN
			let overload   = led.UNKNOWN
			let low_bat    = led.UNKNOWN
			let temp       = led.UNKNOWN

			// if (!this.mk2Model["led.mains"].value) {
			if(led_status == 0x1f && led_blink == 0x1f) {
				// unable to determine the LED status
			} else {
				mains      = ((led_blink &   1) << 1) + (led_status &   1) >> 0
				absorption = ((led_blink &   2) << 1) + (led_status &   2) >> 1
				bulk       = ((led_blink &   4) << 1) + (led_status &   4) >> 2
				float      = ((led_blink &   8) << 1) + (led_status &   8) >> 3
				inverter   = ((led_blink &  16) << 1) + (led_status &  16) >> 4
				overload   = ((led_blink &  32) << 1) + (led_status &  32) >> 5
				low_bat    = ((led_blink &  64) << 1) + (led_status &  64) >> 6
				temp       = ((led_blink & 128) << 1) + (led_status & 128) >> 7
			}

			this.mk2Model["led.mains"].value      =      mains
			this.mk2Model["led.absorption"].value =      absorption
			this.mk2Model["led.bulk"].value       =      bulk
			this.mk2Model["led.float"].value      =      float
			this.mk2Model["led.inverter"].value   =      inverter
			this.mk2Model["led.overload"].value   =      overload
			this.mk2Model["led.low_bat"].value    =      low_bat
			this.mk2Model["led.temp"].value       =      temp

		});
	}


	/** RAM ids whose scale/offset the DC/AC frames need (protocol §7.3.9). */
	private static readonly RAM_SCALINGS: { id: number; field: keyof Calc }[] = [
		{ id: 0, field: "umains_calc" },
		{ id: 1, field: "imains_calc" },
		{ id: 2, field: "uinv_calc" },
		{ id: 3, field: "iinv_calc" },
		{ id: 4, field: "ubat_calc" },
		{ id: 5, field: "ibat_calc" },
		{ id: 7, field: "finv_calc" },
		{ id: 8, field: "fmains_calc" },
	];

	/** Load one RAM scale/offset pair into the calc cache (table-driven). */
	private async loadRamScaling(id: number, field: keyof Calc): Promise<void> {
		const info = await this.getRamInfo(id);
		if (!info.supported) {
			// Sc = 0 means "not supported". Caching scale 0 would publish 0 V / 0 A
			// as if they were measurements (review M1) - leave the field empty and
			// warn only once per connection instead of on every poll (N6).
			if (!this.unsupportedScalings.has(field)) {
				this.unsupportedScalings.add(field);
				this.log.warn(`RAM variable ${id} is not supported by this firmware; dependent values stay null`);
			}
			return;
		}
		this.calc[field] = { scale: info.sc, offset: info.offset };
	}

	// Thin wrappers keep the historical method names used by tests and scripts.
	async umains_calc_load(): Promise<void> { return this.loadRamScaling(0, "umains_calc"); }
	async imains_calc_load(): Promise<void> { return this.loadRamScaling(1, "imains_calc"); }
	async uinv_calc_load(): Promise<void> { return this.loadRamScaling(2, "uinv_calc"); }
	async iinv_calc_load(): Promise<void> { return this.loadRamScaling(3, "iinv_calc"); }
	async ubat_calc_load(): Promise<void> { return this.loadRamScaling(4, "ubat_calc"); }
	async ibat_calc_load(): Promise<void> { return this.loadRamScaling(5, "ibat_calc"); }
	async finv_calc_load(): Promise<void> { return this.loadRamScaling(7, "finv_calc"); }
	async fmains_calc_load(): Promise<void> { return this.loadRamScaling(8, "fmains_calc"); }

	/** Load every missing scaling exactly once per connection. */
	async loadScalingsIfNeeded(): Promise<void> {
		this.log.debug("******   loadScalingsIfNeeded");
		for (const def of Mk2Protocol.RAM_SCALINGS) {
			if (!this.calc[def.field] && !this.unsupportedScalings.has(def.field)) {
				await this.loadRamScaling(def.id, def.field);
			}
		}
	}


	async dc_info(): Promise<void> {
		this.log.debug("******   dc_info");

		return this.conn.communicate (this.create_frame("F", "\x00"), async (response: Buffer): Promise<void> => {

			if (response[0] < 0x0f || response[1] != 0x20 || response[6] != 0x0c ) {
				throw new Error("no dc_info frame")
			}

			const ubat = bp.unpack("<H", response, 7)[0];
			// DC current fields are unsigned 24-bit values (protocol §6.1).
			const ibat = response[9] | (response[10] << 8) | (response[11] << 16);
			const cbat = response[12] | (response[13] << 8) | (response[14] << 16);
			// Inverter period, single byte like the mains period on this firmware.
			const finv = response[15];

			if (this.calc.ubat_calc && this.calc.ibat_calc) {
				const inverterCurrent = round (((ibat+this.calc.ibat_calc.offset) * scale(this.calc.ibat_calc.scale)),   2)
				const chargeCurrent   = round (((cbat+this.calc.ibat_calc.offset) * scale(this.calc.ibat_calc.scale)),   2)
				this.mk2Model["dc_info.ubat"].value = round (((ubat+this.calc.ubat_calc.offset) * scale(this.calc.ubat_calc.scale)),   2)
				this.mk2Model["dc_info.ibat"].value = inverterCurrent
				this.mk2Model["dc_info.icharge"].value = chargeCurrent
				// Net battery current (appendix 2): charging devices minus inverting
				// devices. Positive means charging, like the BMV sign convention.
				this.mk2Model["dc_info.ibat_net"].value = round(chargeCurrent - inverterCurrent, 2)
			} else {
				// Missing scalings (unsupported firmware) must not look like 0 V / 0 A.
				for (const key of ["dc_info.ubat", "dc_info.ibat", "dc_info.icharge", "dc_info.ibat_net"]) {
					this.mk2Model[key].value = null;
				}
			}
			if (this.calc.finv_calc) {
				const period = (finv + this.calc.finv_calc.offset) * scale(this.calc.finv_calc.scale)
				// A raw period of 0 means "no inverter output", not a division by zero.
				this.mk2Model["dc_info.finv"].value = finv > 0 && period > 0 ? round(10 / period, 2) : 0
			} else {
				this.mk2Model["dc_info.finv"].value = null
			}
		});
	}

	async ac_info (): Promise<void> {
		this.log.debug("******   ac_info");

		return this.conn.communicate (this.create_frame("F", "\x01"), async (frame: Buffer):Promise<void> => {

			if (frame[0] < 0x0f || frame[1] != 0x20 || frame[6] < 0x05 || frame[6] > 0x0B ) {
				throw new Error("no ac_info frame")
			}

			const data   = bp.unpack ("<B B B B B H h H h B", frame, 2)
			const bf_factor  = data[0];
			const inv_factor = data[1];
			// const reserved   = data[2];
			const state      = data[3];
			const phase_info = data[4];
			const umains     = data[5];
			const imains     = data[6];
			const uinv       = data[7];
			const iinv       = data[8];
			// The current firmware returns the mains period as a single byte at
			// data[13]; the protocol table describes a 2-byte field. Do not widen
			// blindly, otherwise the checksum byte would be misread.
			const fmains     = data[9]

			if (this.calc.umains_calc
				&& this.calc.imains_calc
				&& this.calc.uinv_calc
				&& this.calc.iinv_calc
				&& this.calc.fmains_calc)
			{
				// §6.1 footnote c: some firmware reports an inverter/backfeed
				// factor of 0. A 0 A current would be wrong, so publish unknown.
				this.mk2Model["ac_info.state"].value = this.acStateFieldValid() ? state : null
				this.mk2Model["ac_info.phase_info"].value = phase_info
				this.mk2Model["ac_info.umains"].value = round (((umains+this.calc.umains_calc.offset) * scale(this.calc.umains_calc.scale)),   0)
				this.mk2Model["ac_info.imains"].value = bf_factor === 0
					? null
					: round (((imains+this.calc.imains_calc.offset) * scale(this.calc.imains_calc.scale) * bf_factor),   2)
				this.mk2Model["ac_info.uinv"].value = round (((uinv+this.calc.uinv_calc.offset) * scale(this.calc.uinv_calc.scale)),   0)
				this.mk2Model["ac_info.iinv"].value = inv_factor === 0
					? null
					: round (((iinv+this.calc.iinv_calc.offset) * scale(this.calc.iinv_calc.scale) * inv_factor),   2)
				// A raw mains period of 0 means "no AC input". Check the raw
				// value, not the scaled one: a non-zero offset would otherwise
				// turn "no grid" into a plausible-looking frequency.
				const mainsPeriod = (fmains + this.calc.fmains_calc.offset) * scale(this.calc.fmains_calc.scale)
				this.mk2Model["ac_info.fmains"].value = fmains > 0 && mainsPeriod > 0 ? round(10 / mainsPeriod, 2) : 0
			} else {
				this.log.debug("ac_info scaling not ready")
				// state/phase need no scaling: keep them visible instead of
				// blanking the whole AC block when a scaling is missing.
				this.mk2Model["ac_info.state"].value = this.acStateFieldValid() ? state : null
				this.mk2Model["ac_info.phase_info"].value = phase_info
				for (const key of ["ac_info.umains", "ac_info.imains", "ac_info.uinv", "ac_info.iinv", "ac_info.fmains"]) {
					this.mk2Model[key].value = null;
				}
			}


		});
	}

	/**
	 * Protocol §6.1: the AC info <State> field exists only on Multi firmware
	 * >= 207. On older units the byte carries something else, so publishing it
	 * as a state would be misleading (measured on firmware 1909140: raw 70).
	 */
	private acStateFieldValid(): boolean {
		const version = this.mk2Model["info.device_sw_version"].value
		if (typeof version != "number" || version <= 0) {
			return true // unknown firmware: keep the raw value
		}
		return version % 1000 >= 207
	}

	/** Publish "unknown" for all switch fields without touching the cached state. */
	private clearSwitchModel(): void {
		for (const key of Object.keys(this.mk2Model)) {
			if (key.startsWith("switch.")) {
				this.mk2Model[key].value = null;
			}
		}
	}

	async master_multi_led_info () : Promise<void> {
		this.log.debug("******   master_multi_led_info");
		return this.conn.communicate (this.create_frame("F", "\x05"), async (response: Buffer) => {

			// §3.2: responses may grow. A 0x0C frame carries 11 data bytes and NO
			// switch register; only 0x0D and longer include it. Reading data[11]
			// unconditionally used to return the checksum as the switch register.
			if (response[0] < 0x0c || response[1] != 0x41) {
				throw new Error("no master_multi_led_info frame")
			}

			const data = bp.unpack("<H H H B", response, 7)

			this.mk2Model["assist.minlimit"].value = data[0]/10.0
			this.mk2Model["assist.maxlimit"].value = data[1]/10.0
			this.mk2Model["assist.limit"].value = data[2]/10.0

			const hasSwitchRegister = response[0] >= 0x0d && response.length >= 15;
			if (!hasSwitchRegister) {
				// No register in this frame: never derive a switch state from other
				// bytes (formerly the checksum), and keep the local state as-is.
				this.clearSwitchModel();
				this.log.debug("master_multi_led_info: frame carries no switch register");
				return;
			}

			// §6.2: the switch register follows the three limits. The documented
			// 0x0D layout puts it at index 13. Longer answers may append or insert
			// bytes; the live 1909209 frame (0F 41 10 10 00 00 04 1F 00 A0 00 1F
			// 00 00 00 67 47) has it at the last data byte. Select between the
			// candidates using the independently read state.state, never by an
			// undocumented flag alone, and publish "unknown" instead of guessing
			// "Off" when the candidates disagree.
			const len = response[0] & 0x7f
			const fixedIndex = 0x0d
			const candidates: number[] = []
			if (len >= fixedIndex) candidates.push(response[fixedIndex])
			if (len > fixedIndex) candidates.push(response[len])
			const stateValue = this.mk2Model["state.state"].value
			const mainState = typeof stateValue === "number" ? Math.floor(stateValue / 10) : 0
			const plausible = (register: number): boolean => {
				const candidateState = switchStateFromRegister(register)
				if (mainState === 2) return candidateState === 4
				if (mainState >= 4 && mainState <= 7) return candidateState === 2 || candidateState === 3
				if (mainState >= 8 && mainState <= 9) return candidateState === 1 || candidateState === 3
				return true
			}
			let switch_register: number | undefined
			if (len === fixedIndex) {
				switch_register = response[fixedIndex]
			} else if (mainState === 0 || mainState === 1) {
				// No usable main state yet: preserve the historical AC-block hint
				// but do not narrow to Off/Charger only below.
				switch_register = (response[3] & 0x10) !== 0 ? response[len] : response[fixedIndex]
			} else {
				const uniqueCandidates = [...new Set(candidates)]
				const preferred = uniqueCandidates.filter(plausible)
				if (preferred.length === 1) {
					switch_register = preferred[0]
				} else if (preferred.length > 1) {
					// Both positions decode to a plausible state (typical during a
					// mode change or with a trailing byte). Keep the state that was
					// already published; never flip the panel state on one frame.
					const previous = this.mk2Model["switch.state"].value;
					const matching = typeof previous === "number"
						? preferred.find((value) => switchStateFromRegister(value) === previous)
						: undefined;
					if (matching !== undefined) {
						switch_register = matching;
					}
				} else if (new Set(uniqueCandidates.map((v) => switchStateFromRegister(v))).size === 1) {
					switch_register = uniqueCandidates[0]
				}
			}
			const derived = switch_register === undefined ? undefined : switchStateFromRegister(switch_register)
			const contradictsOff = derived === 4 && mainState !== 2 && mainState !== 0 && mainState !== 1
			const contradictsChargerOnly = derived === 1 && mainState >= 4 && mainState <= 7
			if (switch_register === undefined || contradictsOff || contradictsChargerOnly) {
				// During a mode change state.state and the F5 register are sampled
				// at different times. Keep the last known switch state instead of
				// flickering to null; the next poll corrects it.
				const hasPrevious = this.mk2Model["switch.state"].value !== null;
				if (hasPrevious) {
					this.log.debug(`master_multi_led_info: switch register inconsistent with state ${String(stateValue)}; keeping the previous value`);
				} else {
					this.log.warn(`master_multi_led_info: switch register ambiguous or inconsistent with state ${String(stateValue)}; keeping it unknown`);
					this.clearSwitchModel()
				}
				return
			}
			this.mk2Model["switch.DirectRemoteSwitchCharge"].value  = (switch_register & 0b00000001) > 0 ? 1 :0
			this.mk2Model["switch.DirectRemoteSwitchInvert"].value  = (switch_register & 0b00000010) > 0 ? 1 :0
			this.mk2Model["switch.FrontSwitchUp"].value             = (switch_register & 0b00000100) > 0 ? 1 :0
			this.mk2Model["switch.FrontSwitchDown"].value           = (switch_register & 0b00001000) > 0 ? 1 :0
			this.mk2Model["switch.SwitchCharge"].value              = (switch_register & 0b00010000) > 0 ? 1 :0
			this.mk2Model["switch.SwitchInvert"].value              = (switch_register & 0b00100000) > 0 ? 1 :0
			this.mk2Model["switch.OnboardRemoteInvertSwitch"].value = (switch_register & 0b01000000) > 0 ? 1 :0
			this.mk2Model["switch.RemoteGeneratorSelected"].value   = (switch_register & 0b10000000) > 0 ? 1 :0

			// The device is authoritative for the panel switch state (issue #7):
			// a front switch or remote panel change must not be overwritten by a
			// stale local cache on the next limit write.
			const applied = switchStateFromRegister(switch_register)
			this.mk2Model["switch.state"].value = applied
			if (applied !== this.currentSwitchState) {
				this.log.info(`switch state changed on the device: ${this.currentSwitchState} -> ${applied}; adopting it`)
				this.currentSwitchState = applied
			}
		}, { readTimeoutMs: 2000 }); // protocol §3.3: the F5 response may take >750 ms
	}


	async get_state () : Promise<void> {
		this.log.debug("******   get_state");

		return this.conn.communicate (this.create_frame("W", "\x0E\x00\x00"), async (response: Buffer) => {
			this.decodeStateResponse(response, "get_state")
		})
	}

	/**
	 * 0x94 <State> <Sub-state> (protocol §7.3.2). The historical state.state
	 * encoding is mainState*10 + subState; the sub-state is also exposed on its
	 * own so charge phases do not have to be decoded from a two-digit number.
	 */
	private decodeStateResponse(response: Buffer, context: string): void {
		if (response[0] < 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != 0x94) {
			throw new Error(`${context}: no valid state response`)
		}

		const data = bp.unpack("<B B", response, 4)
		const mainState = data[0]
		const subState = data[1]
		this.mk2Model["state.state"].value = mainState * 10 + subState
		this.mk2Model["state.substate"].value = subState
	}


	// Set the ampere level for PowerAssist.
	async set_assist (ampere:number) : Promise<number> {
		if (!Number.isFinite(ampere) || ampere < 0) {
			throw new Mk2ValidationError(`set_assist: invalid value ${ampere}`)
		}
		if (ampere === 0) {
			// §5 note 3 applies to the direct write too, not only to grid_mode:
			// with PowerAssist off, 0 A disables the charger and keeps Bypass.
			const assist = this.mk2Model["setting.flag.AssistEnabled"].value
			if (assist === false) {
				throw new Mk2ValidationError("set_assist: 0 A with PowerAssist disabled means charger off + Bypass, not zero grid (§5 note 3)")
			}
			if (assist === null) {
				// 0 A is only zero-grid when PowerAssist is known to be enabled.
				// With an unknown flag it could mean "charger off + Bypass"; refuse
				// until a complete poll has loaded Flags0.
				throw new Mk2ValidationError("set_assist: 0 A requires a known PowerAssist state; wait for the first complete poll")
			}
		}
		const max = this.mk2Model["assist.maxlimit"].value
		if (typeof max == "number" && max > 0 && ampere > max) {
			this.log.warn(`set_assist: clamping ${ampere} A to ${max} A`)
			ampere = max
		}
		const min = this.mk2Model["assist.minlimit"].value
		if (ampere > 0 && typeof min == "number" && min > 0 && ampere < min) {
			// The device would silently clamp up to its minimum (§5 note 2); do it
			// explicitly instead of acknowledging a value that never took effect.
			this.log.warn(`set_assist: clamping ${ampere} A up to the device minimum ${min} A`)
			ampere = min
		}
		const a  = Math.round(ampere * 10)
		// Protocol §5 variant 2: Limit/10 Ampere; values >= 0x8000 mean "ignore
		// the limit". Never let the bitwise conversion wrap around to 0 A.
		if (a > 0x7fff) {
			throw new Mk2ValidationError(`set_assist: ${ampere} A exceeds the protocol range (max 3276.7 A)`)
		}
		const lo = a&0xFF
		const hi = (a>>8) & 0xFF
		if (this.currentSwitchState == 4) {
			// A limit write always carries a panel state. Do not switch a device
			// on that the operator switched off (issue #7).
			throw new Mk2ValidationError("set_assist: device switch is Off; use control.switch_state or control.grid_mode to switch it on explicitly")
		}
		// The S frame carries the panel state, so a limit write can change the
		// operating mode. Say so instead of silently enabling the charger.
		if (ampere > 0 && this.currentSwitchState === 2) {
			this.log.warn("set_assist: a nonzero limit switches the device from Inverter only to On (charger/AC input enabled)")
		}
		if (ampere === 0 && this.currentSwitchState === 1) {
			this.log.warn("set_assist: 0 A while Charger only disables the charger and stays in Bypass (§5 note 3)")
		}
		const data = Buffer.from([this.currentSwitchState,lo, hi, 0x01, 0x80])

		this.log.debug("******   set_assist");

		await this.conn.communicate (this.create_frame("S", data), async (response: Buffer) => {
			if (response[0] < 0x02 || response[1] != 0xff || response[2] != 0x53) {
				throw new Error("set_assist: no valid S response")
			}
			this.log.debug("set_assist ->" + JSON.stringify(response))
		})

		// The S frame is only an acknowledgement; verify the effective limit.
		// 0 A is intentionally special: the device reports its minimum while
		// Invert mode is active, so it cannot be compared numerically.
		await this.master_multi_led_info()
		if (ampere > 0) {
			const actual = this.mk2Model["assist.limit"].value
			if (typeof actual !== "number" || Math.abs(actual - ampere) > 0.11) {
				throw new Mk2ReadbackError(`set_assist: readback mismatch (wanted ${ampere} A, device reports ${actual} A)`)
			}
		} else {
			// 0 A must leave a visible trace: the device reports at least its
			// minimum limit, and Inverter only should also show switch state 2.
			const actual = this.mk2Model["assist.limit"].value
			const min = this.mk2Model["assist.minlimit"].value
			const plausible = (typeof actual === "number" && typeof min === "number" && actual <= min + 0.11)
				|| this.mk2Model["switch.state"].value === 2
			if (!plausible) {
				throw new Mk2ReadbackError(`set_assist: 0 A was not applied (device reports ${String(actual)} A, min ${String(min)} A)`)
			}
		}
		// Keep the command state in sync when this was invoked indirectly by
		// grid_mode; a direct control.set_assist write is acknowledged by main.
		// Return the value the device actually holds, not the raw request: it
		// quantizes to 0.1 A steps.
		const appliedLimit = ampere === 0 ? 0 : this.mk2Model["assist.limit"].value
		const appliedValue = typeof appliedLimit === "number" ? appliedLimit : ampere
		this.mk2Model["control.set_assist"].value = appliedValue
		return appliedValue
	}

	/** Set the VE.Bus switch state without changing the input current limit. */
	async set_switch_state (state:number) : Promise<number> {
		if (![1,2,3,4].includes(state)) {
			throw new Mk2ValidationError(`set_switch_state: invalid state ${state}`)
		}
		// Limit >= 0x8000 means "ignore current limit" (protocol §5, variant 2).
		// A persisted 0 A setpoint from Inverter-only would make a recovered
		// "On" unit never charge, so for charge-capable states write the known
		// configured (or current) limit instead of "ignore".
		let limit = 0xFFFF
		if (state === 1 || state === 3) {
			const configured = this.mk2Model["setting.IMainsLimitAC1"].value
			const current = this.mk2Model["assist.limit"].value
			const value = typeof configured === "number" && configured > 0
				? configured
				: typeof current === "number" && current > 0 ? current : undefined
			if (value !== undefined) {
				limit = Math.round(value * 10)
			}
		}
		const data = Buffer.from([state, limit & 0xFF, (limit >> 8) & 0xFF, 0x01, 0x80])
		await this.conn.communicate (this.create_frame("S", data), async (response: Buffer) => {
			if (response[0] < 0x02 || response[1] != 0xff || response[2] != 0x53) {
				throw new Error("set_switch_state: no valid S response")
			}
		})
		// The S frame is only an acknowledgement. Read the effective state back
		// instead of publishing the requested one optimistically.
		await this.master_multi_led_info()
		const actual = this.mk2Model["switch.state"].value
		if (typeof actual === "number" && actual !== state) {
			throw new Mk2ReadbackError(`set_switch_state: device reports ${String(actual)} instead of ${state}`)
		}
		if (actual === null) {
			// Firmware answered without a switch register; the S ack is all we
			// have. Keep the requested value instead of publishing null.
			this.currentSwitchState = state
			this.mk2Model["switch.state"].value = state
		}
		return state
	}

	/**
	 * Explicit grid/solar mode.
	 * 0 = grid (max input current, switch On)
	 * 1 = zero grid / solar inverter (0 A, switch On; PowerAssist an => Invert)
	 * 2 = inverter only (switch state 2 + 0 A). The live test on 2026-11-15 showed
	 * that switch state 2 alone does NOT enter Invert while AC is present, so the
	 * 0 A limit is required - it is not a substitute for "ignore limit". Note that
	 * this 0 A setpoint persists until another limit is written.
	 */
	async set_grid_mode (mode:number) : Promise<number> {
		if (![0,1,2].includes(mode)) {
			throw new Mk2ValidationError(`set_grid_mode: invalid mode ${mode}`)
		}
		if (this.currentSwitchState == 4) {
			// An explicit mode command may switch the unit on, but say so (review M4).
			this.log.warn("device switch is Off; grid_mode switches it on explicitly")
		}
		if (mode == 1) {
			// Protocol §5 note 3: 0 A means Invert only while PowerAssist is on.
			// With AssistEnabled off it disables the charger and stays in Bypass.
			const assist = this.mk2Model["setting.flag.AssistEnabled"].value
			if (assist === false) {
				throw new Mk2ValidationError("set_grid_mode: zero grid requires PowerAssist; with AssistEnabled=0 a 0 A limit disables the charger and stays in Bypass (§5 note 3)")
			}
			if (assist === null) {
				throw new Mk2ValidationError("set_grid_mode: zero grid requires a known PowerAssist state; wait for the first complete poll")
			}
		}
		// set_assist carries the switch state in the S frame. Mutate the local
		// cache only for the duration of the write and restore it if the write
		// does not reach/confirm the device; otherwise a failed grid_mode would
		// leave currentSwitchState and every later set_assist on a false state.
		const previousSwitchState = this.currentSwitchState
		if (mode == 2) {
			this.currentSwitchState = 2;
			try {
				await this.set_assist(0);
			} catch (error) {
				// The S frame may have reached the device even though the write
				// ultimately failed. Reload the authoritative switch state instead
				// of restoring the pre-write guess.
				await this.reloadSwitchState(previousSwitchState);
				throw error;
			}
			return mode
		}
		this.currentSwitchState = 3
		const configured = this.mk2Model["setting.IMainsLimitAC1"].value
		const current = this.mk2Model["assist.limit"].value
		const max = this.mk2Model["assist.maxlimit"].value
		// Grid mode must not silently raise the shore-current limit: prefer the
		// configured value, then keep the current one, never the device rating
		// just because the configuration is unknown (review N15).
		const limit = mode == 0
			? (typeof configured == "number" && configured > 0
				? configured
				: typeof current == "number" && current > 0
					? current
					: typeof max == "number" && max > 0 ? max : 16)
			: 0
		try {
			await this.set_assist(limit)
		} catch (error) {
			await this.reloadSwitchState(previousSwitchState);
			throw error;
		}
		return mode
	}

	/** Re-read F5 after a failed write; fall back to the pre-write value only
	 * when the device cannot be asked (transport failure). */
	private async reloadSwitchState(fallback: number): Promise<void> {
		try {
			await this.master_multi_led_info()
		} catch {
			this.currentSwitchState = fallback
		}
	}

	async force_state (state:number) : Promise<number> {
		this.log.debug("force_state ->" + state)

		if (![1, 2, 3].includes(state)) {
			throw new Mk2ValidationError(`force_state: invalid state ${state} (1=equalise, 2=absorption, 3=float)`)
		}
		const data = Buffer.from([0x0E, state, 0x00])
		await this.conn.communicate (this.create_frame("W", data), async (response: Buffer) => {
			// Decode the answer like a state read, so the forced charge state is
			// visible in the model instead of only acknowledged.
			this.decodeStateResponse(response, "force_state")
		})
		return state
	}

	/** Read Flags0 (setting 0) as a signed 16-bit value. */
	async readFlags0(): Promise<number> {
		const raw = await this.readSetting(0);
		if (raw === null) {
			throw new Error("readFlags0: Flags0 not supported by this device");
		}
		return raw >= 0x8000 ? raw - 0x10000 : raw;
	}

	/**
	 * Read a setting (CommandReadSetting, protocol §7.3.4).
	 * Returns null when the device answers 0x91 (setting not supported).
	 */
	async readSetting(id: number): Promise<number | null> {
		let value: number | null = null;
		await this.conn.communicate(this.create_frame("W", Buffer.from([0x31, id & 0xFF, (id >> 8) & 0xFF])), async (response: Buffer) => {
			if (response[1] != 0xff || response[2] != 0x57) {
				throw new Error("readSetting: no valid response");
			}
			// 1909209 may return only 0x91 for an unsupported setting, without
			// the two value bytes present in older responses.
			if (response[3] == 0x91) {
				value = null;
				return;
			}
			if (response[0] < 0x05) {
				throw new Error("readSetting: response too short");
			}
			if (response[3] != 0x86) {
				throw new Error("readSetting: unexpected response 0x" + response[3].toString(16));
			}
			value = bp.unpack("<H", response, 4)[0];
		});
		return value;
	}

	/** Write a setting with CommandWriteSetting + CommandWriteData (§7.3.6/7.3.7). */
	async writeSetting(id: number, raw: number): Promise<void> {
		await this.prepareSettingWrite();
		const first_cmd = Buffer.from([0x33, id & 0xFF, (id >> 8) & 0xFF]);
		const second_cmd = Buffer.from([0x34, raw & 0xFF, (raw >> 8) & 0xFF]);
		const frames = Buffer.concat([this.create_frame("W", first_cmd), this.create_frame("W", second_cmd)]);
		return this.conn.communicate(frames, async (response: Buffer) => {
			// 0x88 is the documented write acknowledgement; 0x87 occurs on some
			// firmware for the first of the two concatenated frames.
			if (response[0] < 0x05 || response[1] != 0xff || response[2] != 0x57
				|| (response[3] != 0x88 && response[3] != 0x87)) {
				throw new Error(`writeSetting(${id}): no valid write response`);
			}
		});
	}

	/**
	 * Firmware using long Winmon frames (observed on 1909209) rejects the legacy
	 * WriteSetting/WriteData sequence. Protocol §5 offers FlagsExt0 bit 0 = 1 to
	 * make the MK2 convert long frames to the old short format. The S command
	 * keeps both the current switch state and the input limit unchanged.
	 */
	private async prepareSettingWrite(): Promise<void> {
		if (!this.longWinmonFrames || this.shortWinmonForWrites) {
			return;
		}
		const limit = this.mk2Model["assist.limit"].value
		const rawLimit = typeof limit === "number" && limit > 0 ? Math.round(limit * 10) : 0xFFFF
		const data = Buffer.from([
			this.currentSwitchState, rawLimit & 0xFF, (rawLimit >> 8) & 0xFF, 0x01, 0x80,
			0x00, 0x01, 0x00,
		]);
		await this.conn.communicate(this.create_frame("S", data), async (response: Buffer) => {
			if (response[0] < 0x02 || response[1] != 0xff || response[2] != 0x53) {
				throw new Error("prepareSettingWrite: no valid S response");
			}
		});
		this.shortWinmonForWrites = true;
	}

	/** Write Flags0 with CommandWriteSetting + CommandWriteData. */
	async writeFlags0(flags: number): Promise<void> {
		return this.writeSetting(0, flags & 0xFFFF);
	}

	/**
	 * CommandGetSettingInfo (protocol §7.3.8): scale, offset, default, min, max.
	 * Answers are cached per connection; unsupported settings are reported with
	 * `supported = false` instead of throwing.
	 */
	async getSettingInfo(id: number, force = false): Promise<SettingInfo> {
		const cached = this.settingInfoCache.get(id);
		if (cached && !force) {
			return cached;
		}
		const collector = new SettingInfoCollector(id);
		await this.conn.communicateMulti(
			this.create_frame("W", Buffer.from([0x35, id & 0xFF, (id >> 8) & 0xFF])),
			async (frame: Buffer) => collector.addFrame(frame),
			{ allowQuietEnd: true },
		);
		if (!collector.isComplete()) {
			// A quiet end after the first frame is only acceptable for the explicit
			// "not supported" answer. Anything else would leave min/max unknown and
			// could later authorize a write with made-up limits (review T2).
			throw new Error(`getSettingInfo(${id}): incomplete response, refusing to use it`);
		}
		this.settingInfoCache.set(id, collector.info);
		return collector.info;
	}

	/**
	 * Protocol §7.3.13.3: for flag settings the Maximum value is the bitmask of
	 * supported flags. Never write a bit the device does not advertise.
	 */
	private async assertFlagSupported(flagBit: number): Promise<void> {
		const info = await this.getSettingInfo(0);
		if (!info.supported) {
			throw new Error("Flags0 is not supported by this device");
		}
		if (info.max !== null && (info.max & (1 << flagBit)) === 0) {
			throw new Mk2ValidationError(`flag ${flagBit} is not supported by this device (mask 0x${info.max.toString(16)})`);
		}
	}

	/** Read Flags1 (setting 1) and expose the documented bits 27-31. */
	async get_flags1(): Promise<void> {
		const raw = await this.readSetting(1);
		for (const def of FLAGS1) {
			this.mk2Model[def.key].value = raw === null ? null : (raw & (1 << flags1Bit(def.flag))) !== 0;
		}
	}

	/**
	 * Read the extended, read-only settings once per connection. They are
	 * configuration values, not telemetry, so they do not belong in the 2 s loop.
	 */
	async loadExtendedSettings(force = false): Promise<void> {
		if (this.extendedSettingsLoaded && !force) {
			return;
		}
		for (const def of READONLY_SETTINGS) {
			if (this.failedExtendedSettings.has(def.id) && !force) {
				this.mk2Model[def.key].value = null;
				continue;
			}
			try {
				const info = await this.getSettingInfo(def.id);
				if (!info.supported) {
					this.mk2Model[def.key].value = null;
					continue;
				}
				const raw = await this.readSetting(def.id);
				this.mk2Model[def.key].value = raw === null ? null : round(settingDisplayValue(info, raw), 3);
			} catch (error) {
				// One broken setting must neither block the others nor cause a full
				// reload on every poll (review N9). Negative-cache it until resync.
				this.log.warn(`setting ${def.key} could not be loaded: ${error instanceof Error ? error.message : error}`);
				this.failedExtendedSettings.add(def.id);
				this.mk2Model[def.key].value = null;
			}
		}
		this.extendedSettingsLoaded = true;
	}

	/**
	 * CommandGetRAMVarInfo (protocol §7.3.9) for an arbitrary RAM id, cached per
	 * connection. Sc = 0 means the variable is not supported by this firmware.
	 */
	async getRamInfo(id: number): Promise<RamInfo> {
		const cached = this.ramInfoCache.get(id);
		if (cached) {
			return cached;
		}
		let sc = 0;
		let offset = 0;
		await this.conn.communicate(this.create_frame("W", Buffer.from([0x36, id & 0xFF, (id >> 8) & 0xFF])), async (response: Buffer) => {
			if (response[1] != 0xff || response[2] != 0x57) {
				throw new Error("getRamInfo: not a Winmon response frame");
			}
			// Unsupported variables answer with only 0x8E <Sc=0> and no 0x8F
			// offset (§7.3.9), so the frame is shorter than the usual 0x08.
			// Parse by W frame content instead of by a fixed length.
			let seenScale = false;
			let seenOffset = false;
			for (let i = 3; i + 2 < response.length; i += 3) {
				const cmd = response[i];
				const value = response[i + 1] | (response[i + 2] << 8);
				const signed = value >= 0x8000 ? value - 0x10000 : value;
				if (cmd == 0x8e) {
					sc = signed;
					seenScale = true;
				} else if (cmd == 0x8f) {
					offset = signed;
					seenOffset = true;
				}
			}
			// Long Winmon form (§7.3.9, mode 2): 0x8E <LoSc> <HiSc> <LoOff>
			// <HiOff> without the 0x8F command byte. Parsing it as triplets would
			// drop the offset (its low byte is usually 0x00) and then mis-scale
			// every derived value. Detect by shape, so it also works before the
			// firmware mode is known.
			if (seenScale && !seenOffset && response[3] === 0x8e && response[0] >= 0x07 && response.length >= 9) {
				const longSc = response[4] | (response[5] << 8);
				const longOffset = response[6] | (response[7] << 8);
				sc = longSc >= 0x8000 ? longSc - 0x10000 : longSc;
				offset = longOffset >= 0x8000 ? longOffset - 0x10000 : longOffset;
			}
			if (!seenScale) {
				throw new Error("getRamInfo: response carries no scale");
			}
		});
		const info = makeRamInfo(id, sc, offset);
		this.ramInfoCache.set(id, info);
		return info;
	}

	/**
	 * CommandReadRAMVar (protocol §7.3.3), one id per request. Returns null when
	 * the firmware does not offer the variable; such ids are not polled again.
	 */
	async readRamVar(id: number): Promise<number | null> {
		if (this.unsupportedRam.has(id)) {
			return null;
		}
		const info = await this.getRamInfo(id);
		if (!info.supported) {
			this.unsupportedRam.add(id);
			return null;
		}
		let raw: number | null = null;
		let unsupported = false;
		await this.conn.communicate(this.create_frame("W", Buffer.from([0x30, id & 0xFF, (id >> 8) & 0xFF])), async (response: Buffer) => {
			if (response[0] < 0x05 || response[1] != 0xff || response[2] != 0x57) {
				throw new Error("readRamVar: no valid response");
			}
			if (response[3] == 0x90) {
				unsupported = true;
				return;
			}
			if (response[3] != 0x85) {
				throw new Error("readRamVar: unexpected response 0x" + response[3].toString(16));
			}
			raw = bp.unpack("<H", response, 4)[0];
		});
		if (unsupported || raw === null) {
			this.unsupportedRam.add(id);
			return null;
		}
		return round(ramDisplayValue(info, raw), 3);
	}

	/** Filtered power values and the internal battery monitor SOC (§7.3.13.1). */
	async readRamTelemetry(): Promise<void> {
		const telemetry = [
			{ id: 14, key: "power.inverter" },
			{ id: 16, key: "power.output" },
			{ id: 13, key: "battery.soc" },
		];
		for (const def of telemetry) {
			this.mk2Model[def.key].value = await this.readRamVar(def.id);
		}
	}

	/**
	 * Device identification: MK2 version/mode come from the version frame, the
	 * MultiPlus firmware from CommandSendSoftwareVersion (§7.3.1). Read once per
	 * connection; these values do not change while the device is running.
	 */
	async loadDeviceInfo(force = false): Promise<void> {
		if (this.deviceInfoLoaded && !force) {
			return;
		}
		this.mk2Model["info.mk2_version"].value = this.conn.mk2Version;
		this.mk2Model["info.mk2_mode"].value = this.conn.mk2Mode;

		const version = await this.readDeviceVersion();
		if (version !== null) {
			this.mk2Model["info.device_sw_version"].value = version;
			this.mk2Model["info.device_sw_version_text"].value = formatDeviceVersion(version);
		}
		this.deviceInfoLoaded = true;
	}

	/**
	 * Read the 32-bit device version (protocol §7.3.1). Newer firmware answers
	 * command 0x05 with a long Winmon frame containing both 16-bit parts. In
	 * that case the legacy 0x06 request is not supported and must not be sent.
	 */
	private async readDeviceVersion(): Promise<number | null> {
		let part0: number | null = null;
		let part1: number | null = null;
		await this.conn.communicate(this.create_frame("W", Buffer.from([0x05, 0x00, 0x00])), async (response: Buffer) => {
			if (response[0] < 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != 0x82) {
				throw new Error("readDeviceVersion 0x05: no valid response");
			}
			part0 = bp.unpack("<H", response, 4)[0];
			// Long response: 0x82 <LoPart0> <HiPart0> <LoPart1> <HiPart1> XX XX.
			this.longWinmonFrames = response[0] >= 0x09 && response.length >= 11;
			if (this.longWinmonFrames) {
				part1 = bp.unpack("<H", response, 6)[0];
			}
		});
		if (part0 === null) {
			return null;
		}
		if (part1 === null) {
			part1 = await this.readDeviceVersionPart(0x06, 0x83);
		}
		return part1 === null ? null : ((part1 << 16) | part0) >>> 0;
	}

	private async readDeviceVersionPart(command: number, expected: number): Promise<number | null> {
		let part: number | null = null;
		await this.conn.communicate(this.create_frame("W", Buffer.from([command, 0x00, 0x00])), async (response: Buffer) => {
			if (response[3] === 0x80) {
				// Mode-2 firmware answers unknown commands with 0x80 <reason>.
				// Identification is diagnostic; do not fail the whole poll.
				return;
			}
			if (response[0] < 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != expected) {
				throw new Error(`readDeviceVersionPart 0x${command.toString(16)}: no valid response`);
			}
			part = bp.unpack("<H", response, 4)[0];
		});
		return part;
	}

	async get_flags(): Promise<void> {
		this.log.debug("******   get_flags");
		const flags = await this.readFlags0();

		// Bits 9, 10 and 12 are "not promoted options" and stay untouched.
		for (const [bit, key] of Object.entries(FLAGS0_KEYS)) {
			this.mk2Model[key].value = (flags & (1 << parseInt(bit))) !== 0;
		}

		// Protocol §7.3.13.3: flags[7] must be the inverse of flags[3].
		const waveCheck = (flags & (1 << 3)) !== 0;
		const waveCheckInverted = (flags & (1 << 7)) !== 0;
		if (waveCheck === waveCheckInverted) {
			this.log.warn("Flags0 bit 3 and bit 7 are not inverted (wave check); device configuration is inconsistent");
		}
	}

	async set_flagDisableCharge(value: number): Promise<number> {
		return this.setFlags0Bit(6, value, "DisableCharge");
	}

	async set_flagWeakACInput(value: number): Promise<number> {
		return this.setFlags0Bit(14, value, "WeakACInput");
	}

	async set_flagDisableAES(value: number): Promise<number> {
		return this.setFlags0Bit(8, value, "DisableAES");
	}

	async set_flagAssistEnabled(value: number): Promise<number> {
		return this.setFlags0Bit(5, value, "AssistEnabled");
	}

	/**
	 * Read-modify-write for one Flags0 bit: validate against the device support
	 * mask, write, then read the register back and warn on a mismatch.
	 */
	private async setFlags0Bit(bit: number, value: number, name: string): Promise<number> {
		if (value !== 0 && value !== 1) {
			throw new Mk2ValidationError(`${name}: value must be 0 or 1 (got ${value})`);
		}
		await this.assertFlagSupported(bit);
		const mask = 1 << bit;
		const flags = await this.readFlags0();
		const next = value == 1 ? flags | mask : flags & ~mask;
		if (next === flags) {
			// Nothing to change: do not spend an EEPROM write on it (review F1).
			this.log.debug(`${name}: already ${value}, no write needed`);
			return value;
		}
		await this.writeFlags0(next);
		const readback = await this.readFlags0();
		if (((readback & mask) !== 0) !== (value == 1)) {
			throw new Mk2ReadbackError(`${name}: readback mismatch after write (wanted ${value})`);
		}
		const flagKey = FLAGS0_KEYS[bit];
		if (flagKey) this.mk2Model[flagKey].value = (readback & mask) !== 0;
		return value;
	}

	/** Same pattern for Flags1 (global flag numbers 16-31, setting id 1). */
	private async setFlags1Bit(flag: number, value: number, name: string): Promise<number> {
		if (value !== 0 && value !== 1) {
			throw new Mk2ValidationError(`${name}: value must be 0 or 1 (got ${value})`);
		}
		const bit = flags1Bit(flag);
		const info = await this.getSettingInfo(1);
		if (!info.supported) {
			throw new Mk2ValidationError("Flags1 is not supported by this device");
		}
		if (info.max !== null && (info.max & (1 << bit)) === 0) {
			throw new Mk2ValidationError(`${name}: flag ${flag} is not supported by this device`);
		}
		const mask = 1 << bit;
		const flags = await this.readSetting(1);
		if (flags === null) {
			// Never read-modify-write from an assumed zero: that would clear every
			// unrelated Flags1 option on the device (review T11).
			throw new Mk2ValidationError(`${name}: Flags1 register could not be read, refusing to write`);
		}
		const next = value == 1 ? flags | mask : flags & ~mask;
		if (next === flags) {
			this.log.debug(`${name}: already ${value}, no write needed`);
			return value;
		}
		await this.writeSetting(1, next);
		const readback = await this.readSetting(1);
		if (readback === null) {
			throw new Mk2ReadbackError(`${name}: no Flags1 readback after write`);
		}
		if (((readback & mask) !== 0) !== (value == 1)) {
			throw new Mk2ReadbackError(`${name}: readback mismatch after write (wanted ${value})`);
		}
		const def = FLAGS1.find((d) => d.flag === flag);
		if (def) this.mk2Model[def.key].value = (readback & mask) !== 0;
		return value;
	}

	async set_flagDynamicCurrentLimiter(value: number): Promise<number> {
		return this.setFlags1Bit(28, value, "DynamicCurrentLimiter");
	}

	/**
	 * Write a scaled setting (charge voltages, AC input limits) using the device
	 * metadata: display -> raw conversion, device min/max validation, write and
	 * readback. Also refreshes the read-only setting state.
	 */
	async setSettingScaled(id: number, value: number, name: string): Promise<number> {
		if (!Number.isFinite(value)) {
			throw new Mk2ValidationError(`${name}: invalid value ${value}`);
		}
		const info = await this.getSettingInfo(id);
		if (!info.supported) {
			throw new Mk2ValidationError(`${name}: not supported by this device`);
		}
		const raw = settingRawValue(info, value);
		const min = info.min ?? 0;
		const max = info.max ?? 0xffff;
		if (raw < min || raw > max) {
			throw new Mk2ValidationError(`${name}: ${value} is out of the device range (raw ${min}-${max})`);
		}
		const current = await this.readSetting(id);
		const def = READONLY_SETTINGS.find((d) => d.id === id);
		if (current === raw) {
			this.log.debug(`${name}: already ${value}, no EEPROM write needed`);
			// The previous write may have landed while its readback failed;
			// refresh the published value from the value we just read.
			const applied = round(settingDisplayValue(info, current), 3);
			if (def) this.mk2Model[def.key].value = applied;
			return applied;
		}
		await this.writeSetting(id, raw);
		let readback = await this.readSetting(id);
		if (readback !== raw) {
			// The write may have been applied even though the first readback
			// failed. Re-read once so the published value is not stale.
			try {
				const retry = await this.readSetting(id);
				if (retry !== null) readback = retry;
			} catch {
				// transport failure: the caller retries, the read-before-write
				// guard prevents a second EEPROM write
			}
			if (readback === null) {
				throw new Mk2ReadbackError(`${name}: no readback after write`);
			}
			if (readback !== raw) {
				throw new Mk2ReadbackError(`${name}: readback mismatch (wrote raw ${raw}, device reports ${readback})`);
			}
		}
		const applied = round(settingDisplayValue(info, readback), 3);
		if (def) {
			this.mk2Model[def.key].value = applied;
		}
		// Acknowledge the quantized value the device holds, not the raw request.
		return applied;
	}

	async set_UBatAbsorption(value: number): Promise<number> {
		return this.setSettingScaled(2, value, "UBatAbsorption");
	}

	async set_UBatFloat(value: number): Promise<number> {
		return this.setSettingScaled(3, value, "UBatFloat");
	}

	async set_IMainsLimitAC1(value: number): Promise<number> {
		return this.setSettingScaled(6, value, "IMainsLimitAC1");
	}


	async get_setting_IBatBulk () : Promise<void> {
		this.log.debug("******   get_setting_IBatBulk");
		const info = await this.getSettingInfo(4);
		const raw = await this.readSetting(4);
		this.mk2Model["setting.IBatBulk"].value =
			raw === null ? null : info.supported ? round(settingDisplayValue(info, raw), 2) : raw;
	}


	async set_setting_IBatBulk (value: number) : Promise<number> {
		this.log.debug("******   set_setting_IBatBulk value: " + value);

		if (!Number.isInteger(value)) {
			throw new Mk2ValidationError(`IBatBulk must be an integer (got ${value})`)
		}
		const info = await this.getSettingInfo(4);
		if (!info.supported) {
			throw new Mk2ValidationError("IBatBulk is not supported by this device")
		}
		// Device limits come from GetSettingInfo; 0-120 A is only the fallback for
		// firmware that does not report them.
		const raw = settingRawValue(info, value);
		const min = info.min ?? 0;
		const max = info.max ?? 120;
		if (raw < min || raw > max) {
			throw new Mk2ValidationError(`IBatBulk must be between ${min} and ${max} (got ${value})`)
		}
		const current = await this.readSetting(4);
		if (current === raw) {
			this.log.debug(`IBatBulk: already ${value}, no EEPROM write needed`);
			return value;
		}
		await this.writeSetting(4, raw);
		const readback = await this.readSetting(4);
		if (readback === null) {
			throw new Mk2ReadbackError("IBatBulk: no readback after write");
		}
		if (readback !== raw) {
			throw new Mk2ReadbackError(`IBatBulk: readback mismatch (wrote raw ${raw}, device reports ${readback})`);
		}
		this.mk2Model["setting.IBatBulk"].value = round(settingDisplayValue(info, readback), 2);
		return this.mk2Model["setting.IBatBulk"].value as number;
	}

}