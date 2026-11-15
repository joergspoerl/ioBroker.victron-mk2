import { Mk2Connection } from "./mk2Connection";
import { led, Mk2Model } from "./mk2Model";
import * as bp from "bufferpack";

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
	// power_output_calc: IscaleEntry | undefined

}

function scale (factor: number): number {
	const s = Math.abs(factor)
	if (s >= 0x4000)
		return 1.0/(0x8000 - s)
	return s
}
function round(number: number, decimal: number): number {
	const e = Math.pow(10, decimal)
	return Math.round(number * e) / e
}


export class Mk2Protocol {
	portPath: string
	conn: Mk2Connection
	mk2Model: Mk2Model = new Mk2Model()
	calc: Calc;
	log: ioBroker.Logger;
	/** Current VE.Bus switch state used for S commands (default: On). */
	currentSwitchState = 3;

	constructor(portPath: string, log: ioBroker.Logger, conn?: Mk2Connection) {
		this.portPath = portPath;
		this.conn = conn ?? new Mk2Connection(portPath, log);
		this.calc = new Calc();
		this.log = log;
	}
	async poll(): Promise<void> {
		try {
			await this.conn.ensureSynced()
			await this.address()
			await this.loadScalingsIfNeeded()
			await this.led_status()
			await this.get_state()
			await this.master_multi_led_info()
			await this.dc_info()
			await this.ac_info()
			// await this.get_power_charger()
			// await this.get_power_inverter()
			// await this.get_power_output()
			await this.get_setting_IBatBulk()
			await this.get_flags()

		} catch (Exception) {
			this.log.error("Exception in poll " + Exception)
		}

	}

	/**
	 * Minimal, read-only poll used to determine whether the MultiPlus has
	 * finished booting before any control command is sent.
	 */
	async pollStateOnly(): Promise<void> {
		await this.conn.ensureSynced()
		await this.address()
		await this.get_state()
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
				throw ({ error: "no address frame"})
			}
		})
	}


	async led_status() : Promise<void> {
		this.log.debug("******   led_status");

		return this.conn.communicate(this.create_frame("L", ""), async (response: Buffer) => {

			if (response[0] < 0x05 || response[1] != 0xff || response[2] != 0x4c ) {
				throw ({ error: "no led_status frame"})
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


	async umains_calc_load(): Promise<void> {
		this.log.debug("******   umains_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x00\x00"), async (response: Buffer) => {

			if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57 ) {
				throw ({ error: "no umains_calc_load frame"})
			}

			const data = bp.unpack("<h B h", response, 4)

			this.calc.umains_calc =  {
				scale:  data[0],
				offset: data[2]
			}
		});
	}

	async imains_calc_load (): Promise<void> {
		this.log.debug("******   imains_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x01\x00"), async (response: Buffer) => {

			if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57 ) {
				throw ({ error: "no imains_calc_load frame"})
			}

			const data = bp.unpack("<h B h", response, 4)

			this.calc.imains_calc = {
				scale:  data[0],
				offset: data[2]

			}
		});
	}


	async uinv_calc_load(): Promise<void> {
		this.log.debug("******   uinv_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x02\x00"), async (response: Buffer) => {

			if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57 ) {
				throw ({ error: "no uinv_calc_load frame"})
			}

			const data = bp.unpack("<h B h", response, 4)

			this.calc.uinv_calc =  {
				scale:  data[0],
				offset: data[2]
			}
		});
	}

	async iinv_calc_load (): Promise<void> {
		this.log.debug("******   iinv_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x03\x00"), async (response: Buffer) => {

			if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57 ) {
				throw ({ error: "no iinv_calc_load frame"})
			}

			const data = bp.unpack("<h B h", response, 4)

			this.calc.iinv_calc = {
				scale:  data[0],
				offset: data[2]

			}
		});
	}



	async ubat_calc_load(): Promise<void> {
		this.log.debug("******   ubat_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x04\x00"), async (response: Buffer) => {

			if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57 ) {
				throw ({ error: "no ubat_calc_load frame"})
			}

			const data = bp.unpack("<h B h", response, 4)

			this.calc.ubat_calc =  {
				scale:  data[0],
				offset: data[2]
			}
		});
	}

	async ibat_calc_load (): Promise<void> {
		this.log.debug("******   ibat_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x06\x00"), async (response: Buffer) => {

			if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57 ) {
				throw ({ error: "no ibat_calc_load frame"})
			}

			const data = bp.unpack("<h B h", response, 4)

			this.calc.ibat_calc = {
				scale:  data[0],
				offset: data[2]

			}
		});
	}

	async finv_calc_load(): Promise<void> {
		this.log.debug("******   finv_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x07\x00"), async (response: Buffer) => {

			if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57 ) {
				throw ({ error: "no finv_calc_load frame"})
			}

			const data = bp.unpack("<h B h", response, 4)

			this.calc.finv_calc =  {
				scale:  data[0],
				offset: data[2]
			}
		});
	}

	async fmains_calc_load (): Promise<void> {
		this.log.debug("******   fmains_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x08\x00"), async (response: Buffer) => {

			if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57 ) {
				throw ({ error: "no fmains_calc_load frame"})
			}

			const data = bp.unpack("<h B h", response, 4)

			this.calc.fmains_calc = {
				scale:  data[0],
				offset: data[2]

			}
		});
	}


	async  loadScalingsIfNeeded() :Promise<void> {
		this.log.debug("******   loadScalingsIfNeeded");

		if (   this.calc.ibat_calc
			&& this.calc.iinv_calc
			&& this.calc.imains_calc
			&& this.calc.ubat_calc
			&& this.calc.uinv_calc
			&& this.calc.umains_calc
			&& this.calc.finv_calc
			&& this.calc.fmains_calc) {
			return
		} else {
			await this.umains_calc_load()
			await this.imains_calc_load()
			await this.uinv_calc_load()
			await this.iinv_calc_load()
			await this.ubat_calc_load()
			await this.ibat_calc_load()
			await this.finv_calc_load()
			await this.fmains_calc_load()
		}
	}


	async dc_info(): Promise<void> {
		this.log.debug("******   dc_info");

		return this.conn.communicate (this.create_frame("F", "\x00"), async (response: Buffer): Promise<void> => {

			if (response[0] != 0x0f || response[1] != 0x20 || response[6] != 0x0c ) {
				throw ({ error: "no dc_info frame"})
			}

			const ubat = bp.unpack("<H", response, 7)[0];
			// DC current fields are unsigned 24-bit values (protocol §6.1).
			const ibat = response[9] | (response[10] << 8) | (response[11] << 16);
			const cbat = response[12] | (response[13] << 8) | (response[14] << 16);
			// const finv = bp.unpack("<B", response, 15);

			if (this.calc.ubat_calc && this.calc.ibat_calc && this.calc.finv_calc) {
				this.mk2Model["dc_info.ubat"].value = round (((ubat+this.calc.ubat_calc.offset) * scale(this.calc.ubat_calc.scale)),   2)
				this.mk2Model["dc_info.ibat"].value = round (((ibat+this.calc.ibat_calc.offset) * scale(this.calc.ibat_calc.scale)),   2)
				this.mk2Model["dc_info.icharge"].value = round (((cbat+this.calc.ibat_calc.offset) * scale(this.calc.ibat_calc.scale)),   2)
				// this.mk2Model["dc_info.finv"].value = round ((10 / ((finv+this.calc.finv_calc.offset) * scale(this.calc.finv_calc.scale))), 2)
			}
		});
	}

	async ac_info (): Promise<void> {
		this.log.debug("******   ac_info");

		return this.conn.communicate (this.create_frame("F", "\x01"), async (frame: Buffer):Promise<void> => {

			if (frame[0] != 0x0f || frame[1] != 0x20 || frame[6] < 0x08 || frame[6] > 0x0B ) {
				throw ( { error: "no ac_info frame"} )
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
				this.mk2Model["ac_info.state"].value = state
				this.mk2Model["ac_info.phase_info"].value = phase_info
				this.mk2Model["ac_info.umains"].value = round (((umains+this.calc.umains_calc.offset) * scale(this.calc.umains_calc.scale)),   0)
				this.mk2Model["ac_info.imains"].value = round (((imains+this.calc.imains_calc.offset) * scale(this.calc.imains_calc.scale) * bf_factor),   2)
				this.mk2Model["ac_info.uinv"].value = round (((uinv+this.calc.uinv_calc.offset) * scale(this.calc.uinv_calc.scale)),   0)
				this.mk2Model["ac_info.iinv"].value = round (((iinv+this.calc.iinv_calc.offset) * scale(this.calc.iinv_calc.scale) * inv_factor),   2)
				this.mk2Model["ac_info.fmains"].value = round ((10 / ((fmains + this.calc.fmains_calc.offset) * scale(this.calc.fmains_calc.scale))), 2)
			} else {
				this.log.debug("ac_info scaling not ready")
			}


		});
	}

	async master_multi_led_info () : Promise<void> {
		this.log.debug("******   master_multi_led_info");
		return this.conn.communicate (this.create_frame("F", "\x05"), async (response: Buffer) => {

			if (response[0] != 0x0c || response[1] != 0x41) {
				throw ({ error: "no master_multi_led_info frame"})
			}

			const data = bp.unpack("<H H H B", response, 7)

			this.mk2Model["assist.minlimit"].value = data[0]/10.0
			this.mk2Model["assist.maxlimit"].value = data[1]/10.0
			this.mk2Model["assist.limit"].value = data[2]/10.0

			const switch_register = data[3]
			this.mk2Model["switch.DirectRemoteSwitchCharge"].value  = (switch_register & 0b00000001) > 0 ? 1 :0
			this.mk2Model["switch.DirectRemoteSwitchInvert"].value  = (switch_register & 0b00000010) > 0 ? 1 :0
			this.mk2Model["switch.FrontSwitchUp"].value             = (switch_register & 0b00000100) > 0 ? 1 :0
			this.mk2Model["switch.FrontSwitchDown"].value           = (switch_register & 0b00001000) > 0 ? 1 :0
			this.mk2Model["switch.SwitchCharge"].value              = (switch_register & 0b00010000) > 0 ? 1 :0
			this.mk2Model["switch.SwitchInvert"].value              = (switch_register & 0b00100000) > 0 ? 1 :0
			this.mk2Model["switch.OnboardRemoteInvertSwitch"].value = (switch_register & 0b01000000) > 0 ? 1 :0
			this.mk2Model["switch.RemoteGeneratorSelected"].value   = (switch_register & 0b10000000) > 0 ? 1 :0
		});
	}


	async get_state () : Promise<void> {
		this.log.debug("******   get_state");

		return this.conn.communicate (this.create_frame("W", "\x0E\x00\x00"), async (response: Buffer) => {

			if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != 0x94) {
				throw ({ error: "no get_state frame"})
			}

			const data = bp.unpack("<B B", response, 4)
			const state : number = parseInt ("" + data[0] + data[1]);

			this.mk2Model["state.state"].value = state
		})
	}


	// Set the ampere level for PowerAssist.
	async set_assist (ampere:number) : Promise<void> {
		if (!Number.isFinite(ampere) || ampere < 0) {
			throw new Error(`set_assist: invalid value ${ampere}`)
		}
		const max = this.mk2Model["assist.maxlimit"].value
		if (typeof max == "number" && max > 0 && ampere > max) {
			this.log.warn(`set_assist: clamping ${ampere} A to ${max} A`)
			ampere = max
		}
		const a  = Math.round(ampere * 10)
		const lo = a&0xFF
		const hi = (a>>8) & 0xFF
		// Preserve the current switch state; do not hardcode "On".
		const data = Buffer.from([this.currentSwitchState,lo, hi, 0x01, 0x80])

		this.log.debug("******   set_assist");

		return this.conn.communicate (this.create_frame("S", data), async (response: Buffer) => {
			if (response[0] != 0x02 || response[1] != 0xff || response[2] != 0x53) {
				throw new Error("set_assist: no valid S response")
			}
			this.log.debug("set_assist ->" + JSON.stringify(response))
		})
	}

	/** Set the VE.Bus switch state without changing the input current limit. */
	async set_switch_state (state:number) : Promise<void> {
		if (![1,2,3,4].includes(state)) {
			throw new Error(`set_switch_state: invalid state ${state}`)
		}
		this.currentSwitchState = state
		// Limit >= 0x8000 means "ignore current limit" (protocol §5, variant 2).
		const data = Buffer.from([state, 0xFF, 0xFF, 0x01, 0x80])
		return this.conn.communicate (this.create_frame("S", data), async (response: Buffer) => {
			if (response[0] != 0x02 || response[1] != 0xff || response[2] != 0x53) {
				throw new Error("set_switch_state: no valid S response")
			}
		})
	}

	/**
	 * Explicit grid/solar mode.
	 * 0 = grid (max input current, switch On)
	 * 1 = zero grid / solar inverter (0 A, switch On; PowerAssist an => Invert)
	 * 2 = inverter only (switch state 2, limit ignored)
	 */
	async set_grid_mode (mode:number) : Promise<void> {
		if (![0,1,2].includes(mode)) {
			throw new Error(`set_grid_mode: invalid mode ${mode}`)
		}
		if (mode == 2) {
			this.currentSwitchState = 2;
			await this.set_assist(0);
			return
		}
		this.currentSwitchState = 3
		const max = this.mk2Model["assist.maxlimit"].value
		const limit = mode == 0 ? (typeof max == "number" && max > 0 ? max : 16) : 0
		await this.set_assist(limit)
	}

	async force_state (state:number) : Promise<void> {
		this.log.debug("force_state ->" + state)

		if (state == 1 || state == 2 || state == 3) {
			const data = Buffer.from([0x0E, state, 0x00])
			return this.conn.communicate (this.create_frame("W", data), async (response: Buffer) => {
				if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != 0x94) {
					throw new Error("force_state: no valid response")
				}
				this.log.debug("force_state ->" + response)
			})
		}
	}

	/** Read Flags0 (setting 0) as a signed 16-bit value. */
	async readFlags0(): Promise<number> {
		let value = 0;
		await this.conn.communicate(this.create_frame("W", "\x31\x00\x00"), async (response: Buffer) => {
			if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != 0x86) {
				throw new Error("readFlags0: no valid response");
			}
			const data = bp.unpack("<h", response, 4);
			value = data[0];
		});
		return value;
	}

	/** Write Flags0 with CommandWriteSetting + CommandWriteData. */
	async writeFlags0(flags: number): Promise<void> {
		const first_cmd = Buffer.from([0x33, 0x00, 0x00]);
		const second_cmd = Buffer.from([0x34, flags & 0xFF, (flags >> 8) & 0xFF]);
		const frames = Buffer.concat([this.create_frame("W", first_cmd), this.create_frame("W", second_cmd)]);
		return this.conn.communicate(frames, async (response: Buffer) => {
			if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != 0x88) {
				throw new Error("writeFlags0: no valid write response");
			}
		});
	}

	async get_flags(): Promise<void> {
		this.log.debug("******   get_flags");
		const flags = await this.readFlags0();

		const flagMap: { [key: number]: string } = {
			0: "MultiPhaseSystem",
			1: "MultiPhaseLeader",
			2: "60Hz",
			3: "Disable Wave Check (fast input voltage detection).IMPORTANT: Keep flags[7] consistent. ",
			4: "DoNotStopAfter10HrBulk",
			5: "AssistEnabled",
			6: "DisableCharge",
			7: "IMPORTANT: Must have inverted value of flags[3]",
			8: "DisableAES",
			9: "Not promoted option",
			10: "Not promoted option",
			11: "EnableReducedFloat",
			12: "Not promoted option ",
			13: "Disable ground relay",
			14: "Weak AC input",
			15: "Remote overrules AC2",
		};

		Object.keys(flagMap).forEach((key) => {
			const keyNumber = parseInt(key);
			const bitmask = Math.pow(2, keyNumber);
			const b = (bitmask & flags) > 0;

			if (keyNumber == 0) this.mk2Model["setting.flag.MultiPhaseSystem"].value = b;
			if (keyNumber == 1) this.mk2Model["setting.flag.MultiPhaseLeader"].value = b;
			if (keyNumber == 2) this.mk2Model["setting.flag.Freq60Hz"].value = b;
			if (keyNumber == 4) this.mk2Model["setting.flag.DoNotStopAfter10HrBulk"].value = b;
			if (keyNumber == 5) this.mk2Model["setting.flag.AssistEnabled"].value = b;
			if (keyNumber == 6) this.mk2Model["setting.flag.DisableCharge"].value = b;
			if (keyNumber == 8) this.mk2Model["setting.flag.DisableAES"].value = b;
			if (keyNumber == 11) this.mk2Model["setting.flag.EnableReducedFloat"].value = b;
			if (keyNumber == 13) this.mk2Model["setting.flag.DisableGroundRelay"].value = b;
			if (keyNumber == 14) this.mk2Model["setting.flag.WeakACInput"].value = b;
			if (keyNumber == 15) this.mk2Model["setting.flag.RemoteOverrulesAC2"].value = b;
		});
	}

	async set_flagDisableCharge(value: number): Promise<void> {
		this.log.debug("set_flagDisableCharge newValue " + value);
		const flags = await this.readFlags0();
		const mask = 1 << 6; // DisableCharge
		const newFlags = value == 1 ? (flags | mask) : (flags & ~mask);
		await this.writeFlags0(newFlags);
	}

	async set_flagWeakACInput(value: number): Promise<void> {
		this.log.debug("set_flagWeakACInput newValue " + value);
		const flags = await this.readFlags0();
		const mask = 1 << 14; // Weak AC input
		const newFlags = value == 1 ? (flags | mask) : (flags & ~mask);
		await this.writeFlags0(newFlags);
	}

	async get_setting_IBatBulk () : Promise<void> {
		this.log.debug("******   get_setting_IBatBulk");

		return this.conn.communicate (this.create_frame("W", "\x31\x04\x00"), async (response: Buffer) => {

			// this.conn.frame_debug("get_setting_IBatBulk response", response)
			if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != 0x86) {
				throw ({ error: "no get_setting_IBatBulk frame"})
			}

			const data = bp.unpack("<h", response, 4)

			this.mk2Model["setting.IBatBulk"].value  = data[0]
		})
	}


	async set_setting_IBatBulk (value: number) : Promise<void> {
		this.log.debug("******   set_setting_IBatBulk value: " + value);

		if (!Number.isInteger(value) || value < 0 || value > 120 ) {
			throw new Error(`IBatBulk must be an integer between 0 and 120 (got ${value})`)
		}

		const first_cmd  = Buffer.from([0x33, 0x04, 0x00])
		const second_cmd = Buffer.from([0x34, value & 0xFF, (value >> 8) & 0xFF])
		const frames = Buffer.concat([this.create_frame("W", first_cmd), this.create_frame("W", second_cmd)])

		return this.conn.communicate (frames, async (response: Buffer) => {

			if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != 0x88) {
				throw ({ error: "no set_setting_IBatBulk frame"})
			}

			// const data = bp.unpack("<h", response, 4)
			// console.log("r:", response, "data1: ", data)

			// this.mk2Model["setting.IBatBulk"].value  = data[0]
		})
	}

}