"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mk2Protocol = exports.Calc = void 0;
const mk2Connection_1 = require("./mk2Connection");
const mk2Model_1 = require("./mk2Model");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bp = require("bufferpack");
class Calc {
}
exports.Calc = Calc;
function scale(factor) {
    const s = Math.abs(factor);
    if (s >= 0x4000)
        return 1.0 / (0x8000 - s);
    return s;
}
function round(number, decimal) {
    const e = Math.pow(10, decimal);
    return Math.round(number * e) / e;
}
class Mk2Protocol {
    constructor(portPath) {
        this.mk2Model = new mk2Model_1.Mk2Model();
        this.portPath = portPath;
        this.conn = new mk2Connection_1.Mk2Connection(portPath);
        this.calc = new Calc();
    }
    async poll() {
        try {
            await this.conn.sync();
            await this.address();
            await this.loadScalingsIfNeeded();
            await this.led_status();
            await this.get_state();
            await this.master_multi_led_info();
            await this.dc_info();
            await this.ac_info();
            // await this.get_power_charger()
            // await this.get_power_inverter()
            // await this.get_power_output()
        }
        catch (Exception) {
            console.log("Exception in poll", Exception);
        }
    }
    checksum(buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum = sum + buffer[i];
        }
        const check = sum % 256;
        //console.log("checksum",check)
        return check == 0 ? true : false;
    }
    create_frame(command, data) {
        const len = command.length + data.length + 1;
        let buf = Buffer.from([len, [0xFF]]);
        buf = Buffer.concat([buf, Buffer.from(command)]);
        buf = Buffer.concat([buf, Buffer.from(data)]);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
            sum = sum + buf[i];
        }
        sum = 256 - sum % 256;
        buf = Buffer.concat([buf, Buffer.from([sum])]);
        //    console.log("SEND -> ", buf, buf.toString(), 'checksum',sum);
        // this.conn.frame_debug("SEND ->", buf);
        return buf;
    }
    async address() {
        console.log("******   adress");
        return this.conn.communicate(this.create_frame("A", "\x01\x00"), async (response) => {
            if (response[0] != 0x04 || response[1] != 0xff || response[2] != 0x41 || response[3] != 0x01) {
                throw ({ error: "no address frame" });
            }
        });
    }
    async led_status() {
        console.log("******   led_status");
        return this.conn.communicate(this.create_frame("L", ""), async (response) => {
            if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x4c) {
                throw ({ error: "no led_status frame" });
            }
            const led_status = response[3];
            const led_blink = response[4];
            let mains = mk2Model_1.led.UNKNOWN;
            let absorption = mk2Model_1.led.UNKNOWN;
            let bulk = mk2Model_1.led.UNKNOWN;
            let float = mk2Model_1.led.UNKNOWN;
            let inverter = mk2Model_1.led.UNKNOWN;
            let overload = mk2Model_1.led.UNKNOWN;
            let low_bat = mk2Model_1.led.UNKNOWN;
            let temp = mk2Model_1.led.UNKNOWN;
            // if (!this.mk2Model["led.mains"].value) {
            if (led_status == 0x1f && led_blink == 0x1f) {
                // unable to determine the LED status
            }
            else {
                mains = ((led_blink & 1) << 1) + (led_status & 1) >> 0;
                absorption = ((led_blink & 2) << 1) + (led_status & 2) >> 1;
                bulk = ((led_blink & 4) << 1) + (led_status & 4) >> 2;
                float = ((led_blink & 8) << 1) + (led_status & 8) >> 3;
                inverter = ((led_blink & 16) << 1) + (led_status & 16) >> 4;
                overload = ((led_blink & 32) << 1) + (led_status & 32) >> 5;
                low_bat = ((led_blink & 64) << 1) + (led_status & 64) >> 6;
                temp = ((led_blink & 128) << 1) + (led_status & 128) >> 7;
            }
            this.mk2Model["led.mains"].value = mains;
            this.mk2Model["led.absorption"].value = absorption;
            this.mk2Model["led.bulk"].value = bulk;
            this.mk2Model["led.float"].value = float;
            this.mk2Model["led.inverter"].value = inverter;
            this.mk2Model["led.overload"].value = overload;
            this.mk2Model["led.low_bat"].value = low_bat;
            this.mk2Model["led.temp"].value = temp;
        });
    }
    async umains_calc_load() {
        console.log("******   umains_calc_load");
        return this.conn.communicate(this.create_frame("W", "\x36\x00\x00"), async (response) => {
            if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57) {
                throw ({ error: "no umains_calc_load frame" });
            }
            const data = bp.unpack("<h B h", response, 4);
            this.calc.umains_calc = {
                scale: data[0],
                offset: data[2]
            };
        });
    }
    async imains_calc_load() {
        console.log("******   imains_calc_load");
        return this.conn.communicate(this.create_frame("W", "\x36\x01\x00"), async (response) => {
            if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57) {
                throw ({ error: "no imains_calc_load frame" });
            }
            const data = bp.unpack("<h B h", response, 4);
            this.calc.imains_calc = {
                scale: data[0],
                offset: data[2]
            };
        });
    }
    async uinv_calc_load() {
        console.log("******   uinv_calc_load");
        return this.conn.communicate(this.create_frame("W", "\x36\x02\x00"), async (response) => {
            if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57) {
                throw ({ error: "no uinv_calc_load frame" });
            }
            const data = bp.unpack("<h B h", response, 4);
            this.calc.uinv_calc = {
                scale: data[0],
                offset: data[2]
            };
        });
    }
    async iinv_calc_load() {
        console.log("******   iinv_calc_load");
        return this.conn.communicate(this.create_frame("W", "\x36\x03\x00"), async (response) => {
            if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57) {
                throw ({ error: "no iinv_calc_load frame" });
            }
            const data = bp.unpack("<h B h", response, 4);
            this.calc.iinv_calc = {
                scale: data[0],
                offset: data[2]
            };
        });
    }
    async ubat_calc_load() {
        console.log("******   ubat_calc_load");
        return this.conn.communicate(this.create_frame("W", "\x36\x04\x00"), async (response) => {
            if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57) {
                throw ({ error: "no ubat_calc_load frame" });
            }
            const data = bp.unpack("<h B h", response, 4);
            this.calc.ubat_calc = {
                scale: data[0],
                offset: data[2]
            };
        });
    }
    async ibat_calc_load() {
        console.log("******   ibat_calc_load");
        return this.conn.communicate(this.create_frame("W", "\x36\x06\x00"), async (response) => {
            if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57) {
                throw ({ error: "no ibat_calc_load frame" });
            }
            const data = bp.unpack("<h B h", response, 4);
            this.calc.ibat_calc = {
                scale: data[0],
                offset: data[2]
            };
        });
    }
    async finv_calc_load() {
        console.log("******   finv_calc_load");
        return this.conn.communicate(this.create_frame("W", "\x36\x07\x00"), async (response) => {
            if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57) {
                throw ({ error: "no finv_calc_load frame" });
            }
            const data = bp.unpack("<h B h", response, 4);
            this.calc.finv_calc = {
                scale: data[0],
                offset: data[2]
            };
        });
    }
    async fmains_calc_load() {
        console.log("******   fmains_calc_load");
        return this.conn.communicate(this.create_frame("W", "\x36\x08\x00"), async (response) => {
            if (response[0] != 0x08 || response[1] != 0xff || response[2] != 0x57) {
                throw ({ error: "no fmains_calc_load frame" });
            }
            const data = bp.unpack("<h B h", response, 4);
            this.calc.fmains_calc = {
                scale: data[0],
                offset: data[2]
            };
        });
    }
    // async power_output_calc_load (): Promise<void> {
    // 	console.log("******   power_output_calc_load");
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
    async loadScalingsIfNeeded() {
        console.log("******   loadScalingsIfNeeded");
        if (this.calc.ibat_calc
            && this.calc.iinv_calc
            && this.calc.imains_calc
            && this.calc.ubat_calc
            && this.calc.uinv_calc
            && this.calc.umains_calc) {
            return;
        }
        else {
            await this.umains_calc_load();
            await this.imains_calc_load();
            await this.uinv_calc_load();
            await this.iinv_calc_load();
            await this.ubat_calc_load();
            await this.ibat_calc_load();
            await this.finv_calc_load();
            await this.fmains_calc_load();
        }
    }
    async dc_info() {
        console.log("******   dc_info");
        return this.conn.communicate(this.create_frame("F", "\x00"), async (response) => {
            if (response[0] != 0x0f || response[1] != 0x20 || response[2] != 0xb5) {
                throw ({ error: "no dc_info frame" });
            }
            const ubat = bp.unpack("<H", response, 7);
            //if (frame[11] < 0x80) { frame  }
            const ibat_buf = Buffer.concat([response.slice(9, 12), Buffer.from("\x00"), Buffer.from(response[11] > 0x80 ? "\x00" : "\xFF")]);
            const cbat_buf = Buffer.concat([response.slice(12, 15), Buffer.from("\x00"), Buffer.from(response[14] > 0x80 ? "\x00" : "\xFF")]);
            const ibat = bp.unpack("<i", ibat_buf);
            const cbat = bp.unpack("<i", cbat_buf);
            // const finv = bp.unpack("<B", response, 15);
            if (this.calc.ubat_calc && this.calc.ibat_calc && this.calc.finv_calc) {
                this.mk2Model["dc_info.ubat"].value = round(((ubat + this.calc.ubat_calc.offset) * scale(this.calc.ubat_calc.scale) / 10), 2);
                this.mk2Model["dc_info.ibat"].value = round(((ibat + this.calc.ibat_calc.offset) * scale(this.calc.ibat_calc.scale) / 10), 2);
                this.mk2Model["dc_info.icharge"].value = round(((cbat + this.calc.ibat_calc.offset) * scale(this.calc.ibat_calc.scale) / 10), 2);
                // this.mk2Model["dc_info.finv"].value = round ((10 / ((finv+this.calc.finv_calc.offset) * scale(this.calc.finv_calc.scale))), 2)
            }
        });
    }
    async ac_info() {
        console.log("******   ac_info");
        return this.conn.communicate(this.create_frame("F", "\x01"), async (frame) => {
            if (frame[0] != 0x0f || frame[1] != 0x20 || frame[2] != 0x01) {
                throw ({ error: "no ac_info frame" });
            }
            const data = bp.unpack("<B B B B B H h H h B", frame, 2);
            const bf_factor = data[0];
            const inv_factor = data[1];
            // const reserved   = data[2];
            const state = data[3];
            const phase_info = data[4];
            const umains = data[5];
            const imains = data[6];
            const uinv = data[7];
            const iinv = data[8];
            const fmains = data[9];
            if (this.calc.umains_calc
                && this.calc.imains_calc
                && this.calc.uinv_calc
                && this.calc.iinv_calc
                && this.calc.fmains_calc) {
                this.mk2Model["ac_info.state"].value = state;
                this.mk2Model["ac_info.phase_info"].value = phase_info;
                this.mk2Model["ac_info.umains"].value = round(((umains + this.calc.umains_calc.offset) * scale(this.calc.umains_calc.scale)), 0);
                this.mk2Model["ac_info.imains"].value = round(((imains + this.calc.imains_calc.offset) * scale(this.calc.imains_calc.scale) * bf_factor), 2);
                this.mk2Model["ac_info.uinv"].value = round(((uinv + this.calc.uinv_calc.offset) * scale(this.calc.uinv_calc.scale)), 0);
                this.mk2Model["ac_info.iinv"].value = round(((iinv + this.calc.iinv_calc.offset) * scale(this.calc.iinv_calc.scale) * inv_factor), 2);
                this.mk2Model["ac_info.fmains"].value = round((10 / ((fmains + this.calc.fmains_calc.offset) * scale(this.calc.fmains_calc.scale))), 2);
            }
            else {
                console.log("ac_info scaling not ready");
            }
        });
    }
    async master_multi_led_info() {
        console.log("******   master_multi_led_info");
        return this.conn.communicate(this.create_frame("F", "\x05"), async (response) => {
            if (response[0] != 0x0c || response[1] != 0x41) {
                throw ({ error: "no master_multi_led_info frame" });
            }
            const data = bp.unpack("<H H H B", response, 7);
            this.mk2Model["assist.minlimit"].value = data[0] / 10.0;
            this.mk2Model["assist.maxlimit"].value = data[1] / 10.0;
            this.mk2Model["assist.limit"].value = data[2] / 10.0;
            const switch_register = data[3];
            this.mk2Model["switch.DirectRemoteSwitchCharge"].value = (switch_register & 0b00000001) > 0 ? 1 : 0;
            this.mk2Model["switch.DirectRemoteSwitchInvert"].value = (switch_register & 0b00000010) > 0 ? 1 : 0;
            this.mk2Model["switch.FrontSwitchUp"].value = (switch_register & 0b00000100) > 0 ? 1 : 0;
            this.mk2Model["switch.FrontSwitchDown"].value = (switch_register & 0b00001000) > 0 ? 1 : 0;
            this.mk2Model["switch.SwitchCharge"].value = (switch_register & 0b00010000) > 0 ? 1 : 0;
            this.mk2Model["switch.SwitchInvert"].value = (switch_register & 0b00100000) > 0 ? 1 : 0;
            this.mk2Model["switch.OnboardRemoteInvertSwitch"].value = (switch_register & 0b01000000) > 0 ? 1 : 0;
            this.mk2Model["switch.RemoteGeneratorSelected"].value = (switch_register & 0b10000000) > 0 ? 1 : 0;
        });
    }
    async get_state() {
        console.log("******   get_state");
        return this.conn.communicate(this.create_frame("W", "\x0E\x00\x00"), async (response) => {
            if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57) {
                throw ({ error: "no get_state frame" });
            }
            const data = bp.unpack("<B B", response, 4);
            const state = parseInt("" + data[0] + data[1]);
            this.mk2Model["state.state"].value = state;
        });
    }
    // its not supported with my firmware !!!!
    // async get_power_charger () : Promise<void> {
    // 	console.log("******   get_power_charger");
    // 	return this.conn.communicate (this.create_frame("W", "\x30\x0F\x00"), async (response: Buffer) => {
    // 		if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57) {
    // 			throw ({ error: "no get_power_charger frame"})
    // 		}
    // 		const data = bp.unpack("<h", response, 4)
    // 		console.log("******   get_power_charger unpack", data);
    // 		this.mk2Model["power.charger"].value = data[0]
    // 	})
    // }
    // async get_power_inverter () : Promise<void> {
    // 	console.log("******   get_power_inverter");
    // 	return this.conn.communicate (this.create_frame("W", "\x30\x10\x00"), async (response: Buffer) => {
    // 		if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57) {
    // 			throw ({ error: "no get_power_inverter frame"})
    // 		}
    // 		const data = bp.unpack("<h", response, 4)
    // 		console.log("******   get_power_inverter unpack", data);
    // 		this.mk2Model["power.inverter"].value = data[0]
    // 	})
    // }
    // async get_power_output () : Promise<void> {
    // 	console.log("******   get_power_output");
    // 	return this.conn.communicate (this.create_frame("W", "\x30\x0d"), async (response: Buffer) => {
    // 		if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57) {
    // 			throw ({ error: "no get_power_output frame"})
    // 		}
    // 		const data = bp.unpack("<H", response, 4)
    // 		console.log("******   get_power_output unpack", data);
    // 		//			this.mk2Model["ac_info.iinv"].value = round (((iinv+this.calc.iinv_calc.offset) * scale(this.calc.iinv_calc.scale) * inv_factor),   2)
    // 		// this.mk2Model["power.output"].value = data[0]
    // 	})
    // }
    // Set the ampere level for PowerAssist.
    async set_assist(ampere) {
        const a = ampere * 10;
        const lo = a & 0xFF;
        const hi = a >> 8;
        const data = Buffer.from([0x03, lo, hi, 0x01, 0x80]);
        console.log("******   set_assist");
        return this.conn.communicate(this.create_frame("S", data), async (response) => {
            console.log("set_assist", response);
        });
    }
    async force_state(state) {
        console.log("force_state", state);
        if (state == 1 || state == 2 || state == 3) {
            const data = Buffer.from([0x0E, state, 0x00]);
            return this.conn.communicate(this.create_frame("W", data), async (response) => {
                console.log("force_state", response);
            });
        }
    }
}
exports.Mk2Protocol = Mk2Protocol;
//# sourceMappingURL=mk2Protocol.js.map