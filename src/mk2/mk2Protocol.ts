import { Mk2Connection } from "./mk2Connection";
import { Mk2Model } from "./mk2Model";
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

	constructor(portPath: string) {
		this.portPath = portPath
		this.conn = new Mk2Connection(portPath)
		this.calc = new Calc()
	}
	async poll(): Promise<void> {
		try {
			// await this.conn.sync()
			await this.loadScalingsIfNeeded()
			await this.address()
			await this.led_status()
			await this.get_state()
			await this.master_multi_led_info()
			await this.dc_info()
			await this.ac_info()
		} catch (Exception) {
			console.log("Exception in poll", Exception)
		}

	}

	checksum(buffer: Buffer): boolean {
		let sum = 0;
		for (let i = 0; i < buffer.length; i++) {
			sum = sum + buffer[i]
		}
		const check = sum % 256;
		//console.log("checksum",check)
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

		//    console.log("SEND -> ", buf, buf.toString(), 'checksum',sum);
		// this.conn.frame_debug("SEND ->", buf);

		return buf;

	}

	async address(): Promise<void> {
		console.log("******   adress");

		return this.conn.communicate(this.create_frame("A", "\x01\x00"), async (response: Buffer): Promise<void> => {
			console.log("A", response);

			// decode response frame

		})
	}


	async led_status() : Promise<void> {
		console.log("******   led_status");

		return this.conn.communicate(this.create_frame("L", ""), async (response: Buffer) => {

			const led_status = response[3];
			const led_blink = response[4];

			this.mk2Model["led.mains"].value =      ((led_status & 1) > 0 ? ((led_blink & 1) > 0 ? 2 : 1) : 0)
			this.mk2Model["led.absorption"].value = ((led_status & 2) > 0 ? ((led_blink & 2) > 0 ? 2 : 1) : 0)
			this.mk2Model["led.bulk"].value =       ((led_status & 4) > 0 ? ((led_blink & 4) > 0 ? 2 : 1) : 0)
			this.mk2Model["led.float"].value =      ((led_status & 8) > 0 ? ((led_blink & 8) > 0 ? 2 : 1) : 0)
			this.mk2Model["led.inverter"].value =   ((led_status & 16) > 0 ? ((led_blink & 16) > 0 ? 2 : 1) : 0)
			this.mk2Model["led.overload"].value =   ((led_status & 32) > 0 ? ((led_blink & 32) > 0 ? 2 : 1) : 0)
			this.mk2Model["led.low_bat"].value =    ((led_status & 64) > 0 ? ((led_blink & 64) > 0 ? 2 : 1) : 0)
			this.mk2Model["led.temp"].value =       ((led_status & 128) > 0 ? ((led_blink & 128) > 0 ? 2 : 1) : 0)

		}
		);
	}


	async umains_calc_load(): Promise<void> {
		console.log("******   umains_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x00\x00"), async (frame: Buffer) => {
			const data = bp.unpack("<h B h", frame, 4)

			this.calc.umains_calc =  {
				scale:  data[0],
				offset: data[2]
			}
		});
	}

	async imains_calc_load (): Promise<void> {
		console.log("******   imains_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x01\x00"), async (frame: Buffer) => {
			const data = bp.unpack("<h B h", frame, 4)

			this.calc.imains_calc = {
				scale:  data[0],
				offset: data[2]

			}
		});
	}


	async uinv_calc_load(): Promise<void> {
		console.log("******   uinv_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x02\x00"), async (frame: Buffer) => {
			const data = bp.unpack("<h B h", frame, 4)

			this.calc.uinv_calc =  {
				scale:  data[0],
				offset: data[2]
			}
		});
	}

	async iinv_calc_load (): Promise<void> {
		console.log("******   iinv_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x03\x00"), async (frame: Buffer) => {
			const data = bp.unpack("<h B h", frame, 4)

			this.calc.iinv_calc = {
				scale:  data[0],
				offset: data[2]

			}
		});
	}



	async ubat_calc_load(): Promise<void> {
		console.log("******   ubat_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x04\x00"), async (frame: Buffer) => {
			const data = bp.unpack("<h B h", frame, 4)

			this.calc.ubat_calc =  {
				scale:  data[0],
				offset: data[2]
			}
		});
	}

	async ibat_calc_load (): Promise<void> {
		console.log("******   ibat_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x05\x00"), async (frame: Buffer) => {
			const data = bp.unpack("<h B h", frame, 4)

			this.calc.ibat_calc = {
				scale:  data[0],
				offset: data[2]

			}
		});
	}

	async finv_calc_load(): Promise<void> {
		console.log("******   finv_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x07\x00"), async (frame: Buffer) => {
			const data = bp.unpack("<h B h", frame, 4)

			this.calc.finv_calc =  {
				scale:  data[0],
				offset: data[2]
			}
		});
	}

	async fmains_calc_load (): Promise<void> {
		console.log("******   fmains_calc_load");

		return this.conn.communicate (this.create_frame("W", "\x36\x08\x00"), async (frame: Buffer) => {
			const data = bp.unpack("<h B h", frame, 4)

			this.calc.fmains_calc = {
				scale:  data[0],
				offset: data[2]

			}
		});
	}



	async  loadScalingsIfNeeded() :Promise<void> {
		console.log("******   loadScalingsIfNeeded");

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
		console.log("******   dc_info");

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
			const finv = bp.unpack("<B", response, 15);

			if (this.calc.ubat_calc && this.calc.ibat_calc && this.calc.finv_calc) {
				this.mk2Model["dc_info.ubat"].value = round (((ubat+this.calc.ubat_calc.offset) * scale(this.calc.ubat_calc.scale) / 10),   2)
				this.mk2Model["dc_info.ibat"].value = round (((ibat+this.calc.ibat_calc.offset) * scale(this.calc.ibat_calc.scale) / 10),   2)
				this.mk2Model["dc_info.icharge"].value = round (((cbat+this.calc.ibat_calc.offset) * scale(this.calc.ibat_calc.scale) / 10),   2)
				// this.mk2Model["dc_info.finv"].value = round ((10 / finv), 1)
				this.mk2Model["dc_info.finv"].value = round ((10 / ((finv+this.calc.finv_calc.offset) * scale(this.calc.finv_calc.scale))), 2)
			}
		});
	}

	async ac_info (): Promise<void> {
		console.log("******   ac_info");

		return this.conn.communicate (this.create_frame("F", "\x01"), async (frame: Buffer):Promise<void> => {

			if (frame[0] != 0x0f || frame[1] != 0x20 || frame[2] != 0x01 ) {
				throw ( { error: "no ac_info frame"} )
			}

			const data   = bp.unpack ("<H h H h B", frame, 7)
			const umains = data[0];
			const imains = data[1];
			const uinv   = data[2];
			const iinv   = data[3];
			const fmains = data[4]

			if (this.calc.umains_calc
				&& this.calc.imains_calc
				&& this.calc.uinv_calc
				&& this.calc.iinv_calc
				&& this.calc.fmains_calc)
			{
				this.mk2Model["ac_info.umains"].value = round (((umains+this.calc.umains_calc.offset) * scale(this.calc.umains_calc.scale)),   2)
				this.mk2Model["ac_info.imains"].value = round (((imains+this.calc.imains_calc.offset) * scale(this.calc.imains_calc.scale)),   2)
				this.mk2Model["ac_info.uinv"].value = round (((uinv+this.calc.uinv_calc.offset) * scale(this.calc.uinv_calc.scale)),   2)
				this.mk2Model["ac_info.iinv"].value = round (((iinv+this.calc.iinv_calc.offset) * scale(this.calc.iinv_calc.scale)),   2)
				// this.mk2Model["ac_info.fmains"].value = round ((10 / fmains), 1)
				this.mk2Model["ac_info.fmains"].value = round ((10 / ((fmains + this.calc.fmains_calc.offset) * scale(this.calc.fmains_calc.scale))), 1)
			} else {
				console.log("ac_info scaling not ready")
			}


		});
	}

	async master_multi_led_info () : Promise<void> {
		console.log("******   master_multi_led_info");
		return this.conn.communicate (this.create_frame("F", "\x05"), async (response: Buffer) => {

			if (response[0] != 0x0c || response[1] != 0x41) {
				throw ({ error: "no master_multi_led_info frame"})
			}

			const data = bp.unpack("<H H H", response, 7)

			this.mk2Model["assist.limit"].value = data[0]/10.0
			this.mk2Model["assist.minlimit"].value = data[1]/10.0
			this.mk2Model["assist.maxlimit"].value = data[2]/10.0
		});
	}


	async get_state () : Promise<void> {
		console.log("******   get_state");

		return this.conn.communicate (this.create_frame("W", "\x0E\x00\x00"), async (response: Buffer) => {

			const data = bp.unpack("<B B", response, 4)
			const state : number = parseInt ("" + data[0] + data[1]);


			this.mk2Model["state.state"].value = state
		})
	}

	// Set the ampere level for PowerAssist.
	async set_assist (ampere:number) : Promise<void> {
		const a  = ampere * 10
		const lo = a&0xFF
		const hi = a>>8
		const data = Buffer.from([0x03,lo, hi, 0x01, 0x80])

		console.log("******   set_assist");

		return this.conn.communicate (this.create_frame("S", data), async (response: Buffer) => {

			console.log("set_assist", response)
		})
	}

	async force_state (state:number) : Promise<void> {

		console.log("force_state", state)

		// assert s in (1, 2, 3), 'state must be between 1 and 3'
		// self.communicate('W', '\x0E' + chr(s) + '\x00')


		// const a  = ampere * 10
		// const lo = a&0xFF
		// const hi = a>>8
		// const data = Buffer.from([0x03,lo, hi, 0x01, 0x80])

		// console.log("******   set_assist");

		// return this.conn.communicate (this.create_frame("S", data), async (response: Buffer) => {

		// 	console.log("set_assist", response)
		// })
	}

}