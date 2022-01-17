import { Mk2Connection } from "./mk2Connection";
import { Mk2Model } from "./mk2Model";

export class Mk2Protocol {
	conn: Mk2Connection = new Mk2Connection()
	mk2Model: Mk2Model = new Mk2Model()
	checksum (buffer: Buffer) : boolean {
		let sum = 0;
		for (let i = 0; i < buffer.length; i++) {
			sum = sum + buffer[i]
		}
		const check = sum % 256;
		//console.log("checksum",check)
		return check == 0 ? true : false;
	}


	create_frame(command: string, data: string): Buffer {
		const len = command.length + data.length + 1;
		let buf = Buffer.from(len.toString());
		buf = Buffer.concat([buf, Buffer.from((0xFF).toString())]);
		buf = Buffer.concat([buf, Buffer.from(command)]);
		buf = Buffer.concat([buf, Buffer.from(data)]);

		let sum = 0;
		for (let i = 0; i < buf.length; i++) {
			sum = sum + buf[i]
		}

		sum = 256 - sum % 256;
		buf = Buffer.concat([buf, Buffer.from([sum])]);

		//    console.log("SEND -> ", buf, buf.toString(), 'checksum',sum);
		this.conn.frame_debug("SEND ->", buf);

		return buf;

	}

	async address(): Promise<void> {
		return this.conn.communicate (this.create_frame("A", "\x01\x00"), async (response: Buffer): Promise<void> => {
			console.log("A",response);

			// decode response frame

		})
	}

}


// this.led_status = async function () {
// 	return communicate (create_frame("L", ""), (frame) => {
// 		const led_status = frame[3];
// 		const led_blink  = frame[4];

// 		return {
// 			led_status: {
// 				"mains": ((led_status & 1) > 0 ? ((led_blink & 1) > 0 ? "blink" : "on") : "off"),
// 				"absorption": ((led_status & 2) > 0 ? ((led_blink & 2) > 0 ? "blink" : "on") : "off"),
// 				"bulk": ((led_status & 4) > 0 ? ((led_blink & 4) > 0 ? "blink" : "on") : "off"),
// 				"float": ((led_status & 8) > 0 ? ((led_blink & 8) > 0 ? "blink" : "on") : "off"),
// 				"inverter": ((led_status & 16) > 0 ? ((led_blink & 16) > 0 ? "blink" : "on") : "off"),
// 				"overload": ((led_status & 32) > 0 ? ((led_blink & 32) > 0 ? "blink" : "on") : "off"),
// 				"low bat": ((led_status & 64) > 0 ? ((led_blink & 64) > 0 ? "blink" : "on") : "off"),
// 				"temp": ((led_status & 128) > 0 ? ((led_blink & 128) > 0 ? "blink" : "on") : "off"),
// 			}
// 		}
// 	});
// }

// this.umains_calc_load = async function() {
// 	return communicate (create_frame("W", "\x36\x00\x00"), (frame) => {
// 		const data = bp.unpack("<h B h", frame, 4)
// 		return {
// 			umains_calc: {
// 				scale:  data[0],
// 				offset: data[2]
// 			}
// 		}
// 	});
// }

// this.imains_calc_load = async function() {
// 	return communicate (create_frame("W", "\x36\x01\x00"), (frame) => {
// 		const data = bp.unpack("<h B h", frame, 4)
// 		return {
// 			imains_calc: {
// 				scale:  data[0],
// 				offset: data[2]
// 			}
// 		}
// 	});
// }

// this.uinv_calc_load = async function() {
// 	return communicate (create_frame("W", "\x36\x02\x00"), (frame) => {
// 		const data = bp.unpack("<h B h", frame, 4)
// 		return {
// 			uinv_calc: {
// 				scale:  data[0],
// 				offset: data[2]
// 			}
// 		}
// 	});
// }

// this.iinv_calc_load = async function() {
// 	return communicate (create_frame("W", "\x36\x03\x00"), (frame) => {
// 		const data = bp.unpack("<h B h", frame, 4)
// 		return {
// 			iinv_calc: {
// 				scale:  data[0],
// 				offset: data[2]
// 			}
// 		}
// 	});
// }

// this.ubat_calc_load = async function() {
// 	return communicate (create_frame("W", "\x36\x04\x00"), (frame) => {
// 		const data = bp.unpack("<h B h", frame, 4)
// 		return {
// 			ubat_calc:
//             {
//             	scale:  data[0],
//             	offset: data[2]
//             }
// 		}
// 	});
// }

// this.ibat_calc_load = async function() {
// 	return communicate (create_frame("W", "\x36\x05\x00"), (frame) => {
// 		const data = bp.unpack("<h B h", frame, 4)
// 		return {
// 			ibat_calc: {
// 				scale:  data[0],
// 				offset: data[2]
// 			}
// 		}
// 	});
// }

// this.finv_calc_load = async function() {
// 	return communicate (create_frame("W", "\x36\x07\x00"), (frame) => {
// 		const data = bp.unpack("<h B h", frame, 4)
// 		return {
// 			finv_calc: {
// 				scale:  data[0],
// 				offset: data[2]
// 			}
// 		}
// 	});
// }

// this.fmains_calc_load = async function() {
// 	return communicate (create_frame("W", "\x36\x08\x00"), (frame) => {
// 		const data = bp.unpack("<h B h", frame, 4)
// 		return {
// 			fmains_calc: {
// 				scale: data[0],
// 				offset: data[2]
// 			}
// 		}
// 	});
// }


// function scale (factor) {
// 	s = Math.abs(factor)
// 	if (s >= 0x4000)
// 		return 1.0/(0x8000 - s)
// 	return s
// }


// this.dc_info = async function() {
// 	if (!self.calc.ubat_calc) Object.assign(self.calc, await self.ubat_calc_load());
// 	if (!self.calc.ibat_calc) Object.assign(self.calc, await self.ibat_calc_load());
// 	if (!self.calc.finv_calc) Object.assign(self.calc, await self.finv_calc_load());

// 	console.log("self.calc", self.calc)

// 	return communicate (create_frame("F", "\x00"), async (frame) => {

// 		if (frame[0] != 0x0f || frame[1] != 0x20 || frame[2] != 0xb5 ) {
// 			return { error: "no dc_info frame"}
// 		}

// 		const ubat = bp.unpack("<H", frame, 7);
// 		//if (frame[11] < 0x80) { frame  }
// 		ibat_buf = Buffer.concat([frame.slice(9,12),  Buffer.from("\x00"), Buffer.from(frame[11]>0x80 ? "\x00" : "\xFF")])
// 		cbat_buf = Buffer.concat([frame.slice(12,15), Buffer.from("\x00"), Buffer.from(frame[14]>0x80 ? "\x00" : "\xFF")])
// 		const ibat = bp.unpack("<i", ibat_buf);
// 		const cbat = bp.unpack("<i", cbat_buf);
// 		const finv = bp.unpack("<B", frame, 15);

// 		return {
// 			dc_info: {
// 				ubat: round (((ubat+self.calc.ubat_calc.offset) * scale(self.calc.ubat_calc.scale) / 10),   2),
// 				ibat: round (((ibat+self.calc.ibat_calc.offset) * scale(self.calc.ibat_calc.scale) / 10),   2),
// 				cbat: round (((cbat+self.calc.ibat_calc.offset) * scale(self.calc.ibat_calc.scale) / 10),   2),
// 				finv: round ((10 / ((finv+self.calc.finv_calc.offset) * scale(self.calc.finv_calc.scale))), 2),
// 			}
// 		}
// 	});
// }

// this.ac_info = async function() {
// 	if (!self.calc.umains_calc) Object.assign(self.calc, await self.umains_calc_load());
// 	if (!self.calc.imains_calc) Object.assign(self.calc, await self.imains_calc_load());
// 	if (!self.calc.uinv_calc)   Object.assign(self.calc, await self.uinv_calc_load());
// 	if (!self.calc.iinv_calc)   Object.assign(self.calc, await self.iinv_calc_load());
// 	if (!self.calc.fmains_calc) Object.assign(self.calc, await self.fmains_calc_load());

// 	return communicate (create_frame("F", "\x01"), (frame) => {

// 		if (frame[0] != 0x0f || frame[1] != 0x20 || frame[2] != 0x01 ) {
// 			return { error: "no ac_info frame"}
// 		}

// 		const data   = bp.unpack ("<H h H h B", frame, 7)
// 		const umains = data[0];
// 		const imains = data[1];
// 		const uinv   = data[2];
// 		const iinv   = data[3];
// 		const fmains = data[4]

// 		return {
// 			ac_info: {
// 				umains: round (((umains+self.calc.umains_calc.offset) * scale(self.calc.umains_calc.scale)), 1),
// 				imains: round (((imains+self.calc.imains_calc.offset) * scale(self.calc.imains_calc.scale)), 1),
// 				uinv:   round (((uinv+self.calc.uinv_calc.offset) * scale(self.calc.uinv_calc.scale)), 1),
// 				iinv:   round (((iinv+self.calc.iinv_calc.offset) * scale(self.calc.iinv_calc.scale)), 1),
// 				fmains: round ((10 / ((fmains + self.calc.fmains_calc.offset) * scale(self.calc.fmains_calc.scale))), 1)
// 			}
// 		}
// 	});
// }

// this.master_multi_led_info = async function () {
// 	return communicate (create_frame("F", "\x05"), (frame) => {

// 		if (frame[0] != 0x0f || frame[1] != 0x20) {
// 			return { error: "no master_multi_led_info frame"}
// 		}

// 		const data = bp.unpack("<H H H", frame, 7)

// 		return {
// 			name: "master_multi_led_info",
// 			min_limit: data[0]/10.0,
// 			max_limit: data[1]/10.0,
// 			limit:     data[2]/10.0
// 		}
// 	});
// }

// const states = {
// 	"00": "down",
// 	"10": "startup",
// 	"20": "off",
// 	"30": "slave",
// 	"40": "invert full",
// 	"50": "invert half",
// 	"60": "invert aes",
// 	"70": "assist",
// 	"80": "bypass",
// 	"90": "charge init",
// 	"91": "charge bulk",
// 	"92": "charge absorption",
// 	"93": "charge float",
// 	"94": "charge storage",
// 	"95": "charge repeated absorption",
// 	"96": "charge forced absorption",
// 	"97": "charge equalise",
// 	"98": "charge bulk stopped",
// }

// this.get_state = async function () {
// 	return communicate (create_frame("W", "\x0E\x00\x00"), (frame) => {
// 		const data = bp.unpack("<B B", frame, 4)
// 		const state = "" + data[0] + data[1];
// 		return {
// 			get_state: {
// 				state: states[state]
// 			}
// 		}
// 	})
// }

// // Set the ampere level for PowerAssist.
// this.set_assist = async function (ampere) {
// 	const a  = ampere * 10
// 	const lo = a&0xFF
// 	const hi = a>>8
// 	const data = Buffer.from([0x03,lo, hi, 0x01, 0x80])

// 	return communicate (create_frame("S", data), (frame) => {
// 		return {
// 			set_assist: {
// 				setlimit: ampere
// 			}
// 		}
// 	})
// }
