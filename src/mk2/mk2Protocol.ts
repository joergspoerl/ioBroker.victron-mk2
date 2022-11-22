import { Mk2Connection } from "./mk2Connection";
import { led, Mk2Model } from "./mk2Model";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bp = require("bufferpack");

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

	constructor(portPath: string, log: ioBroker.Logger) {
		this.portPath = portPath
		this.conn = new Mk2Connection(portPath, log)
		this.calc = new Calc()
		this.log = log
	}
	async poll(): Promise<void> {
		try {
			await this.conn.sync()
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

			if (response[0] != 0x04 || response[1] != 0xff || response[2] != 0x41 || response[3] != 0x01 ) {
				throw ({ error: "no address frame"})
			}
		})
	}


	async led_status() : Promise<void> {
		this.log.debug("******   led_status");

		return this.conn.communicate(this.create_frame("L", ""), async (response: Buffer) => {

			if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x4c ) {
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


	// async power_output_calc_load (): Promise<void> {
	// 	this.log.debug("******   power_output_calc_load");

	// 	return this.conn.communicate (this.create_frame("W", "\x36\x11\x00"), async (response: Buffer) => {

	// 		if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57 ) {
	// 			throw ({ error: "no power_output_calc_load frame"})
	// 		}

	// 		const data = bp.unpack("<h B h", response, 4)

	// 		this.calc.power_output_calc = {
	// 			scale:  data[0],
	// 			offset: data[2]

	// 		}
	// 	});
	// }


	async  loadScalingsIfNeeded() :Promise<void> {
		this.log.debug("******   loadScalingsIfNeeded");

		if (   this.calc.ibat_calc
			&& this.calc.iinv_calc
			&& this.calc.imains_calc
			&& this.calc.ubat_calc
			&& this.calc.uinv_calc
			&& this.calc.umains_calc) {
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

			if (response[0] != 0x0f || response[1] != 0x20 || response[2] != 0xb5 ) {
				throw ({ error: "no dc_info frame"})
			}

			const ubat = bp.unpack("<H", response, 7);
			//if (frame[11] < 0x80) { frame  }
			const ibat_buf = Buffer.concat([response.slice(9,12),  Buffer.from("\x00"), Buffer.from(response[11]>0x80 ? "\x00" : "\xFF")])
			const cbat_buf = Buffer.concat([response.slice(12,15), Buffer.from("\x00"), Buffer.from(response[14]>0x80 ? "\x00" : "\xFF")])
			const ibat = bp.unpack("<i", ibat_buf);
			const cbat = bp.unpack("<i", cbat_buf);
			// const finv = bp.unpack("<B", response, 15);

			if (this.calc.ubat_calc && this.calc.ibat_calc && this.calc.finv_calc) {
				this.mk2Model["dc_info.ubat"].value = round (((ubat+this.calc.ubat_calc.offset) * scale(this.calc.ubat_calc.scale) / 10),   2)
				this.mk2Model["dc_info.ibat"].value = round (((ibat+this.calc.ibat_calc.offset) * scale(this.calc.ibat_calc.scale) / 10),   2)
				this.mk2Model["dc_info.icharge"].value = round (((cbat+this.calc.ibat_calc.offset) * scale(this.calc.ibat_calc.scale) / 10),   2)
				// this.mk2Model["dc_info.finv"].value = round ((10 / ((finv+this.calc.finv_calc.offset) * scale(this.calc.finv_calc.scale))), 2)
			}
		});
	}

	async ac_info (): Promise<void> {
		this.log.debug("******   ac_info");

		return this.conn.communicate (this.create_frame("F", "\x01"), async (frame: Buffer):Promise<void> => {

			if (frame[0] != 0x0f || frame[1] != 0x20 || frame[2] != 0x01 ) {
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

			if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57) {
				throw ({ error: "no get_state frame"})
			}

			const data = bp.unpack("<B B", response, 4)
			const state : number = parseInt ("" + data[0] + data[1]);

			this.mk2Model["state.state"].value = state
		})
	}


	// its not supported with my firmware !!!!

	// async get_power_charger () : Promise<void> {
	// 	this.log.debug("******   get_power_charger");

	// 	return this.conn.communicate (this.create_frame("W", "\x30\x0F\x00"), async (response: Buffer) => {

	// 		if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57) {
	// 			throw ({ error: "no get_power_charger frame"})
	// 		}

	// 		const data = bp.unpack("<h", response, 4)
	// 		this.log.debug("******   get_power_charger unpack", data);

	// 		this.mk2Model["power.charger"].value = data[0]
	// 	})
	// }

	// async get_power_inverter () : Promise<void> {
	// 	this.log.debug("******   get_power_inverter");

	// 	return this.conn.communicate (this.create_frame("W", "\x30\x10\x00"), async (response: Buffer) => {

	// 		if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57) {
	// 			throw ({ error: "no get_power_inverter frame"})
	// 		}

	// 		const data = bp.unpack("<h", response, 4)
	// 		this.log.debug("******   get_power_inverter unpack", data);

	// 		this.mk2Model["power.inverter"].value = data[0]
	// 	})
	// }

	// async get_power_output () : Promise<void> {
	// 	this.log.debug("******   get_power_output");

	// 	return this.conn.communicate (this.create_frame("W", "\x30\x0d"), async (response: Buffer) => {

	// 		if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57) {
	// 			throw ({ error: "no get_power_output frame"})
	// 		}

	// 		const data = bp.unpack("<H", response, 4)
	// 		this.log.debug("******   get_power_output unpack", data);
	// 		//			this.mk2Model["ac_info.iinv"].value = round (((iinv+this.calc.iinv_calc.offset) * scale(this.calc.iinv_calc.scale) * inv_factor),   2)
	// 		// this.mk2Model["power.output"].value = data[0]
	// 	})
	// }


	// Set the ampere level for PowerAssist.
	async set_assist (ampere:number) : Promise<void> {
		const a  = ampere * 10
		const lo = a&0xFF
		const hi = a>>8
		const data = Buffer.from([0x03,lo, hi, 0x01, 0x80])

		this.log.debug("******   set_assist");

		return this.conn.communicate (this.create_frame("S", data), async (response: Buffer) => {

			this.log.debug("set_assist ->" + JSON.stringify(response))
		})
	}

	async force_state (state:number) : Promise<void> {
		this.log.debug("force_state ->" + state)

		if (state == 1 || state == 2 || state == 3) {
			const data = Buffer.from([0x0E, state, 0x00])
			return this.conn.communicate (this.create_frame("W", data), async (response: Buffer) => {
				this.log.debug("force_state ->" + response)
			})
		}
	}

	async get_flags () : Promise<void> {
		this.log.debug("******   get_flags");

		return this.conn.communicate (this.create_frame("W", "\x31\x00\x00"), async (response: Buffer) => {

			if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != 0x86) {
				throw ({ error: "no get_flags frame"})
			}

			const data = bp.unpack("<h", response, 4)

			const flags : { [key: number]: string } = {
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
			}

			Object.keys(flags).forEach( (key)=>{
				const keyNumber = parseInt( key )
				const bitmask = Math.pow(2, keyNumber);
				const b = (bitmask & data[0]) > 0
				// console.log( b, key, flags[keyNumber ])

				if (keyNumber ==  0) this.mk2Model["setting.flag.MultiPhaseSystem"].value  = b
				if (keyNumber ==  1) this.mk2Model["setting.flag.MultiPhaseLeader"].value  = b
				if (keyNumber ==  2) this.mk2Model["setting.flag.Freq60Hz"].value  = b
				if (keyNumber ==  4) this.mk2Model["setting.flag.DoNotStopAfter10HrBulk"].value  = b
				if (keyNumber ==  5) this.mk2Model["setting.flag.AssistEnabled"].value  = b
				if (keyNumber ==  6) this.mk2Model["setting.flag.DisableCharge"].value  = b
				if (keyNumber ==  8) this.mk2Model["setting.flag.DisableAES"].value  = b
				if (keyNumber == 11) this.mk2Model["setting.flag.EnableReducedFloat"].value  = b
				if (keyNumber == 13) this.mk2Model["setting.flag.DisableGroundRelay"].value  = b
				if (keyNumber == 14) this.mk2Model["setting.flag.WeakACInput"].value  = b
				if (keyNumber == 15) this.mk2Model["setting.flag.RemoteOverrulesAC2"].value  = b
			})
		})
	}

	async set_flagDisableCharge(value: number) : Promise<void> {
		this.log.debug("set_flagDisableCharge newValue " +  value)

		// function dec2bin(dec:number) : string {
		// 	return (dec >>> 0).toString(2);
		// }

		return this.conn.communicate (this.create_frame("W", "\x31\x00\x00"), async (response: Buffer) => {

			if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != 0x86) {
				throw ({ error: "no get_flags frame"})
			}

			// this.log.debug("response first  byte: " + dec2bin(response[4]))
			// this.log.debug("response second byte: " + dec2bin(response[5]))

			let flagBytes = bp.unpack("<h", response, 4)
			// this.log.debug("old " + dec2bin(flagBytes))
			// this.log.debug("oldFlagsByte + " + JSON.stringify(flagBytes))

			const mask = 1 << 6; // gets the 6th bit
			// let newFlagBytes: number
			// this.log.debug("mask: " + dec2bin(mask))

			if (value == 1) {
				flagBytes |= mask
			}
			if (value == 0) {
				flagBytes &= ~mask
			}

			// this.log.debug("new " + dec2bin(flagBytes))


			// const flags : { [key: number]: string } = {
			// 	0: "MultiPhaseSystem",
			// 	1: "MultiPhaseLeader",
			// 	2: "60Hz",
			// 	3: "Disable Wave Check (fast input voltage detection).IMPORTANT: Keep flags[7] consistent. ",
			// 	4: "DoNotStopAfter10HrBulk",
			// 	5: "AssistEnabled",
			// 	6: "DisableCharge",
			// 	7: "IMPORTANT: Must have inverted value of flags[3]",
			// 	8: "DisableAES",
			// 	9: "Not promoted option",
			// 	10: "Not promoted option",
			// 	11: "EnableReducedFloat",
			// 	12: "Not promoted option ",
			// 	13: "Disable ground relay",
			// 	14: "Weak AC input",
			// 	15: "Remote overrules AC2",
			// }

			// Object.keys(flags).forEach( (key)=>{
			// 	const keyNumber = parseInt( key )
			// 	const bitmask = Math.pow(2, keyNumber);
			// 	const b = (bitmask & flagBytes) > 0

			// 	console.log( b, key, flags[keyNumber ])
			// })

			const newDataBytes = bp.pack("<h", [flagBytes])
			// this.log.debug("oldFlagsByte + " + JSON.stringify(newDataBytes))
			// console.log(newDataBytes)

			// const flagBytetest = bp.unpack("<h", newDataBytes, 0)
			// this.log.debug("flagBytetest " + dec2bin(flagBytetest))
			// console.log(flagBytetest)

			const first_cmd  = Buffer.from([0x33, 0x00, 0x00])
			let  second_cmd = Buffer.from([0x34])
			second_cmd = Buffer.concat([second_cmd, newDataBytes])
			// console.log("second_cmd", second_cmd)
			const frames = Buffer.concat([this.create_frame("W", first_cmd), this.create_frame("W", second_cmd)])

			// this.conn.frame_debug("check frame", frames)

			return this.conn.communicate (frames, async (response: Buffer) => {
				this.conn.frame_debug("response", response)
			})

		})
	}



	async set_flagWeakACInput(value: number) : Promise<void> {
		this.log.debug("set_flagWeakACInput newValue " +  value)

		// function dec2bin(dec:number) : string {
		// 	return (dec >>> 0).toString(2);
		// }

		return this.conn.communicate (this.create_frame("W", "\x31\x00\x00"), async (response: Buffer) => {

			if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != 0x86) {
				throw ({ error: "no get_flags frame"})
			}

			// this.log.debug("response first  byte: " + dec2bin(response[4]))
			// this.log.debug("response second byte: " + dec2bin(response[5]))

			let flagBytes = bp.unpack("<h", response, 4)
			// this.log.debug("old " + dec2bin(flagBytes))
			// this.log.debug("oldFlagsByte + " + JSON.stringify(flagBytes))

			const mask = 1 << 14; // gets the 6th bit
			// let newFlagBytes: number
			// this.log.debug("mask: " + dec2bin(mask))

			if (value == 1) {
				flagBytes |= mask
			}
			if (value == 0) {
				flagBytes &= ~mask
			}

			// this.log.debug("new " + dec2bin(flagBytes))


			const flags : { [key: number]: string } = {
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
			}

			Object.keys(flags).forEach( (key)=>{
				const keyNumber = parseInt( key )
				const bitmask = Math.pow(2, keyNumber);
				const b = (bitmask & flagBytes) > 0

				console.log( b, key, flags[keyNumber ])
			})

			const newDataBytes = bp.pack("<h", [flagBytes])
			// this.log.debug("oldFlagsByte + " + JSON.stringify(newDataBytes))
			// console.log(newDataBytes)

			// const flagBytetest = bp.unpack("<h", newDataBytes, 0)
			// this.log.debug("flagBytetest " + dec2bin(flagBytetest))
			// console.log(flagBytetest)

			const first_cmd  = Buffer.from([0x33, 0x00, 0x00])
			let  second_cmd = Buffer.from([0x34])
			second_cmd = Buffer.concat([second_cmd, newDataBytes])
			// console.log("second_cmd", second_cmd)
			const frames = Buffer.concat([this.create_frame("W", first_cmd), this.create_frame("W", second_cmd)])

			// this.conn.frame_debug("check frame", frames)

			return this.conn.communicate (frames, async (response: Buffer) => {
				this.conn.frame_debug("response", response)
			})

		})
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

		if (value < 0 && value > 120 ) {
			this.log.error("value out of range")
			throw "value out of range"
		}

		const first_cmd  = Buffer.from([0x33, 0x04, 0x00])
		const second_cmd = Buffer.from([0x34, value, 0x00])
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