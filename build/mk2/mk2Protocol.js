"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mk2Protocol = exports.Calc = void 0;
const mk2Connection_1 = require("./mk2Connection");
const mk2Model_1 = require("./mk2Model");
const mk2Settings_1 = require("./mk2Settings");
const mk2Ram_1 = require("./mk2Ram");
const mk2Switch_1 = require("./mk2Switch");
const bp = __importStar(require("bufferpack"));
const errors_1 = require("../lib/errors");
class Calc {
}
exports.Calc = Calc;
function scale(factor) {
    return (0, mk2Ram_1.ramScale)(factor);
}
function round(number, decimal) {
    const e = Math.pow(10, decimal);
    return Math.round(number * e) / e;
}
class Mk2Protocol {
    constructor(portPath, log, conn) {
        this.mk2Model = new mk2Model_1.Mk2Model();
        /** Current VE.Bus switch state used for S commands (default: On). */
        this.currentSwitchState = 3;
        /** Cached CommandGetSettingInfo answers, keyed by setting id. */
        this.settingInfoCache = new Map();
        this.extendedSettingsLoaded = false;
        this.ramInfoCache = new Map();
        this.unsupportedRam = new Set();
        this.deviceInfoLoaded = false;
        this.portPath = portPath;
        this.conn = conn !== null && conn !== void 0 ? conn : new mk2Connection_1.Mk2Connection(portPath, log);
        this.calc = new Calc();
        this.log = log;
    }
    async poll() {
        try {
            await this.conn.ensureSynced();
            await this.address();
            await this.loadScalingsIfNeeded();
            await this.loadDeviceInfo();
            await this.led_status();
            await this.get_state();
            await this.master_multi_led_info();
            await this.dc_info();
            await this.ac_info();
            await this.optionalStep("RAM telemetry", () => this.readRamTelemetry());
            await this.get_setting_IBatBulk();
            await this.get_flags();
            await this.get_flags1();
            await this.optionalStep("extended settings", () => this.loadExtendedSettings());
            this.mk2Model["info.connection"].value = true;
        }
        catch (Exception) {
            this.mk2Model["info.connection"].value = false;
            this.log.error("Exception in poll " + Exception);
        }
        finally {
            this.updateDiagnostics();
        }
    }
    /**
     * Optional feature blocks must not abort the whole poll: firmware without a
     * given RAM variable or setting is normal, not a connection failure.
     */
    async optionalStep(name, fn) {
        try {
            await fn();
        }
        catch (error) {
            // Only feature-level failures are optional. A transport error means the
            // connection is gone and must reach poll()'s failure path (review T6).
            if (error instanceof errors_1.Mk2TransportError) {
                throw error;
            }
            this.log.warn(`optional step "${name}" failed: ${error instanceof Error ? error.message : error}`);
        }
    }
    /** Mirror the connection health counters into the model (issue #8). */
    updateDiagnostics() {
        var _a, _b, _c;
        this.mk2Model["diag.timeouts"].value = (_a = this.conn.timeouts) !== null && _a !== void 0 ? _a : 0;
        this.mk2Model["diag.checksum_errors"].value = (_b = this.conn.checksumErrors) !== null && _b !== void 0 ? _b : 0;
        this.mk2Model["diag.last_error"].value = (_c = this.conn.lastError) !== null && _c !== void 0 ? _c : "";
    }
    /**
     * Minimal, read-only poll used to determine whether the MultiPlus has
     * finished booting before any control command is sent.
     */
    async pollStateOnly() {
        await this.conn.ensureSynced();
        await this.address();
        await this.get_state();
    }
    checksum(buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum = sum + buffer[i];
        }
        const check = sum % 256;
        //this.log.debug("checksum",check)
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
        //    this.log.debug("SEND -> ", buf, buf.toString(), 'checksum',sum);
        // this.conn.frame_debug("SEND ->", buf);
        return buf;
    }
    async address() {
        this.log.debug("******   adress");
        return this.conn.communicate(this.create_frame("A", "\x01\x00"), async (response) => {
            if (response[0] < 0x04 || response[1] != 0xff || response[2] != 0x41 || response[3] != 0x01) {
                throw ({ error: "no address frame" });
            }
            // The reply carries the address currently used by the MK2 (§7.1).
            this.mk2Model["info.address"].value = response[4];
        });
    }
    async led_status() {
        this.log.debug("******   led_status");
        return this.conn.communicate(this.create_frame("L", ""), async (response) => {
            if (response[0] < 0x05 || response[1] != 0xff || response[2] != 0x4c) {
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
        this.log.debug("******   umains_calc_load");
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
        this.log.debug("******   imains_calc_load");
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
        this.log.debug("******   uinv_calc_load");
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
        this.log.debug("******   iinv_calc_load");
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
        this.log.debug("******   ubat_calc_load");
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
        this.log.debug("******   ibat_calc_load");
        // RAM ID 5 = IBat (protocol §7.3.13.1). ID 6 is UBatRMS and was used here
        // by mistake; both happen to scale by 0.01 on the current firmware, but
        // ID 5 is the signed one (appendix 2).
        return this.conn.communicate(this.create_frame("W", "\x36\x05\x00"), async (response) => {
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
        this.log.debug("******   finv_calc_load");
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
        this.log.debug("******   fmains_calc_load");
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
    async loadScalingsIfNeeded() {
        this.log.debug("******   loadScalingsIfNeeded");
        if (this.calc.ibat_calc
            && this.calc.iinv_calc
            && this.calc.imains_calc
            && this.calc.ubat_calc
            && this.calc.uinv_calc
            && this.calc.umains_calc
            && this.calc.finv_calc
            && this.calc.fmains_calc) {
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
        this.log.debug("******   dc_info");
        return this.conn.communicate(this.create_frame("F", "\x00"), async (response) => {
            if (response[0] != 0x0f || response[1] != 0x20 || response[6] != 0x0c) {
                throw ({ error: "no dc_info frame" });
            }
            const ubat = bp.unpack("<H", response, 7)[0];
            // DC current fields are unsigned 24-bit values (protocol §6.1).
            const ibat = response[9] | (response[10] << 8) | (response[11] << 16);
            const cbat = response[12] | (response[13] << 8) | (response[14] << 16);
            // Inverter period, single byte like the mains period on this firmware.
            const finv = response[15];
            if (this.calc.ubat_calc && this.calc.ibat_calc) {
                const inverterCurrent = round(((ibat + this.calc.ibat_calc.offset) * scale(this.calc.ibat_calc.scale)), 2);
                const chargeCurrent = round(((cbat + this.calc.ibat_calc.offset) * scale(this.calc.ibat_calc.scale)), 2);
                this.mk2Model["dc_info.ubat"].value = round(((ubat + this.calc.ubat_calc.offset) * scale(this.calc.ubat_calc.scale)), 2);
                this.mk2Model["dc_info.ibat"].value = inverterCurrent;
                this.mk2Model["dc_info.icharge"].value = chargeCurrent;
                // Net battery current (appendix 2): charging devices minus inverting
                // devices. Positive means charging, like the BMV sign convention.
                this.mk2Model["dc_info.ibat_net"].value = round(chargeCurrent - inverterCurrent, 2);
            }
            if (this.calc.finv_calc) {
                const period = (finv + this.calc.finv_calc.offset) * scale(this.calc.finv_calc.scale);
                // A period of 0 means "no inverter output", not a division by zero.
                this.mk2Model["dc_info.finv"].value = period > 0 ? round(10 / period, 2) : 0;
            }
        });
    }
    async ac_info() {
        this.log.debug("******   ac_info");
        return this.conn.communicate(this.create_frame("F", "\x01"), async (frame) => {
            if (frame[0] != 0x0f || frame[1] != 0x20 || frame[6] < 0x08 || frame[6] > 0x0B) {
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
            // The current firmware returns the mains period as a single byte at
            // data[13]; the protocol table describes a 2-byte field. Do not widen
            // blindly, otherwise the checksum byte would be misread.
            const fmains = data[9];
            if (this.calc.umains_calc
                && this.calc.imains_calc
                && this.calc.uinv_calc
                && this.calc.iinv_calc
                && this.calc.fmains_calc) {
                this.mk2Model["ac_info.state"].value = this.acStateFieldValid() ? state : null;
                this.mk2Model["ac_info.phase_info"].value = phase_info;
                this.mk2Model["ac_info.umains"].value = round(((umains + this.calc.umains_calc.offset) * scale(this.calc.umains_calc.scale)), 0);
                this.mk2Model["ac_info.imains"].value = round(((imains + this.calc.imains_calc.offset) * scale(this.calc.imains_calc.scale) * bf_factor), 2);
                this.mk2Model["ac_info.uinv"].value = round(((uinv + this.calc.uinv_calc.offset) * scale(this.calc.uinv_calc.scale)), 0);
                this.mk2Model["ac_info.iinv"].value = round(((iinv + this.calc.iinv_calc.offset) * scale(this.calc.iinv_calc.scale) * inv_factor), 2);
                this.mk2Model["ac_info.fmains"].value = round((10 / ((fmains + this.calc.fmains_calc.offset) * scale(this.calc.fmains_calc.scale))), 2);
            }
            else {
                this.log.debug("ac_info scaling not ready");
            }
        });
    }
    /**
     * Protocol §6.1: the AC info <State> field exists only on Multi firmware
     * >= 207. On older units the byte carries something else, so publishing it
     * as a state would be misleading (measured on firmware 1909140: raw 70).
     */
    acStateFieldValid() {
        const version = this.mk2Model["info.device_sw_version"].value;
        if (typeof version != "number" || version <= 0) {
            return true; // unknown firmware: keep the raw value
        }
        return version % 1000 >= 207;
    }
    async master_multi_led_info() {
        this.log.debug("******   master_multi_led_info");
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
            // The device is authoritative for the panel switch state (issue #7):
            // a front switch or remote panel change must not be overwritten by a
            // stale local cache on the next limit write.
            const derived = (0, mk2Switch_1.switchStateFromRegister)(switch_register);
            this.mk2Model["switch.state"].value = derived;
            if (derived !== this.currentSwitchState) {
                this.log.info(`switch state changed on the device: ${this.currentSwitchState} -> ${derived}; adopting it`);
                this.currentSwitchState = derived;
            }
        }, { readTimeoutMs: 2000 }); // protocol §3.3: the F5 response may take >750 ms
    }
    async get_state() {
        this.log.debug("******   get_state");
        return this.conn.communicate(this.create_frame("W", "\x0E\x00\x00"), async (response) => {
            this.decodeStateResponse(response, "get_state");
        });
    }
    /**
     * 0x94 <State> <Sub-state> (protocol §7.3.2). The historical state.state
     * encoding is mainState*10 + subState; the sub-state is also exposed on its
     * own so charge phases do not have to be decoded from a two-digit number.
     */
    decodeStateResponse(response, context) {
        if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != 0x94) {
            throw new Error(`${context}: no valid state response`);
        }
        const data = bp.unpack("<B B", response, 4);
        const mainState = data[0];
        const subState = data[1];
        this.mk2Model["state.state"].value = mainState * 10 + subState;
        this.mk2Model["state.substate"].value = subState;
    }
    // Set the ampere level for PowerAssist.
    async set_assist(ampere) {
        if (!Number.isFinite(ampere) || ampere < 0) {
            throw new errors_1.Mk2ValidationError(`set_assist: invalid value ${ampere}`);
        }
        const max = this.mk2Model["assist.maxlimit"].value;
        if (typeof max == "number" && max > 0 && ampere > max) {
            this.log.warn(`set_assist: clamping ${ampere} A to ${max} A`);
            ampere = max;
        }
        const a = Math.round(ampere * 10);
        // Protocol §5 variant 2: Limit/10 Ampere; values >= 0x8000 mean "ignore
        // the limit". Never let the bitwise conversion wrap around to 0 A.
        if (a > 0x7fff) {
            throw new errors_1.Mk2ValidationError(`set_assist: ${ampere} A exceeds the protocol range (max 3276.7 A)`);
        }
        const lo = a & 0xFF;
        const hi = (a >> 8) & 0xFF;
        if (this.currentSwitchState == 4) {
            // A limit write always carries a panel state. Do not switch a device
            // on that the operator switched off (issue #7).
            throw new errors_1.Mk2ValidationError("set_assist: device switch is Off; use control.switch_state or control.grid_mode to switch it on explicitly");
        }
        const data = Buffer.from([this.currentSwitchState, lo, hi, 0x01, 0x80]);
        this.log.debug("******   set_assist");
        return this.conn.communicate(this.create_frame("S", data), async (response) => {
            if (response[0] != 0x02 || response[1] != 0xff || response[2] != 0x53) {
                throw new Error("set_assist: no valid S response");
            }
            this.log.debug("set_assist ->" + JSON.stringify(response));
        });
    }
    /** Set the VE.Bus switch state without changing the input current limit. */
    async set_switch_state(state) {
        if (![1, 2, 3, 4].includes(state)) {
            throw new errors_1.Mk2ValidationError(`set_switch_state: invalid state ${state}`);
        }
        this.currentSwitchState = state;
        // Limit >= 0x8000 means "ignore current limit" (protocol §5, variant 2).
        const data = Buffer.from([state, 0xFF, 0xFF, 0x01, 0x80]);
        return this.conn.communicate(this.create_frame("S", data), async (response) => {
            if (response[0] != 0x02 || response[1] != 0xff || response[2] != 0x53) {
                throw new Error("set_switch_state: no valid S response");
            }
        });
    }
    /**
     * Explicit grid/solar mode.
     * 0 = grid (max input current, switch On)
     * 1 = zero grid / solar inverter (0 A, switch On; PowerAssist an => Invert)
     * 2 = inverter only (switch state 2, limit ignored)
     */
    async set_grid_mode(mode) {
        if (![0, 1, 2].includes(mode)) {
            throw new errors_1.Mk2ValidationError(`set_grid_mode: invalid mode ${mode}`);
        }
        if (mode == 2) {
            this.currentSwitchState = 2;
            await this.set_assist(0);
            return;
        }
        this.currentSwitchState = 3;
        const max = this.mk2Model["assist.maxlimit"].value;
        const limit = mode == 0 ? (typeof max == "number" && max > 0 ? max : 16) : 0;
        await this.set_assist(limit);
    }
    async force_state(state) {
        this.log.debug("force_state ->" + state);
        if (![1, 2, 3].includes(state)) {
            throw new errors_1.Mk2ValidationError(`force_state: invalid state ${state} (1=equalise, 2=absorption, 3=float)`);
        }
        const data = Buffer.from([0x0E, state, 0x00]);
        return this.conn.communicate(this.create_frame("W", data), async (response) => {
            // Decode the answer like a state read, so the forced charge state is
            // visible in the model instead of only acknowledged.
            this.decodeStateResponse(response, "force_state");
        });
    }
    /** Read Flags0 (setting 0) as a signed 16-bit value. */
    async readFlags0() {
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
    async readSetting(id) {
        let value = null;
        await this.conn.communicate(this.create_frame("W", Buffer.from([0x31, id & 0xFF, (id >> 8) & 0xFF])), async (response) => {
            if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57) {
                throw new Error("readSetting: no valid response");
            }
            if (response[3] == 0x91) {
                value = null;
                return;
            }
            if (response[3] != 0x86) {
                throw new Error("readSetting: unexpected response 0x" + response[3].toString(16));
            }
            value = bp.unpack("<H", response, 4)[0];
        });
        return value;
    }
    /** Write a setting with CommandWriteSetting + CommandWriteData (§7.3.6/7.3.7). */
    async writeSetting(id, raw) {
        const first_cmd = Buffer.from([0x33, id & 0xFF, (id >> 8) & 0xFF]);
        const second_cmd = Buffer.from([0x34, raw & 0xFF, (raw >> 8) & 0xFF]);
        const frames = Buffer.concat([this.create_frame("W", first_cmd), this.create_frame("W", second_cmd)]);
        return this.conn.communicate(frames, async (response) => {
            if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != 0x88) {
                throw new Error(`writeSetting(${id}): no valid write response`);
            }
        });
    }
    /** Write Flags0 with CommandWriteSetting + CommandWriteData. */
    async writeFlags0(flags) {
        return this.writeSetting(0, flags & 0xFFFF);
    }
    /**
     * CommandGetSettingInfo (protocol §7.3.8): scale, offset, default, min, max.
     * Answers are cached per connection; unsupported settings are reported with
     * `supported = false` instead of throwing.
     */
    async getSettingInfo(id, force = false) {
        const cached = this.settingInfoCache.get(id);
        if (cached && !force) {
            return cached;
        }
        const collector = new mk2Settings_1.SettingInfoCollector(id);
        await this.conn.communicateMulti(this.create_frame("W", Buffer.from([0x35, id & 0xFF, (id >> 8) & 0xFF])), async (frame) => collector.addFrame(frame), { allowQuietEnd: true });
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
    async assertFlagSupported(flagBit) {
        const info = await this.getSettingInfo(0);
        if (!info.supported) {
            throw new Error("Flags0 is not supported by this device");
        }
        if (info.max !== null && (info.max & (1 << flagBit)) === 0) {
            throw new errors_1.Mk2ValidationError(`flag ${flagBit} is not supported by this device (mask 0x${info.max.toString(16)})`);
        }
    }
    /** Read Flags1 (setting 1) and expose the documented bits 27-31. */
    async get_flags1() {
        const raw = await this.readSetting(1);
        for (const def of mk2Settings_1.FLAGS1) {
            this.mk2Model[def.key].value = raw === null ? null : (raw & (1 << (0, mk2Settings_1.flags1Bit)(def.flag))) !== 0;
        }
    }
    /**
     * Read the extended, read-only settings once per connection. They are
     * configuration values, not telemetry, so they do not belong in the 2 s loop.
     */
    async loadExtendedSettings(force = false) {
        if (this.extendedSettingsLoaded && !force) {
            return;
        }
        for (const def of mk2Settings_1.READONLY_SETTINGS) {
            const info = await this.getSettingInfo(def.id);
            if (!info.supported) {
                this.mk2Model[def.key].value = null;
                continue;
            }
            const raw = await this.readSetting(def.id);
            this.mk2Model[def.key].value = raw === null ? null : round((0, mk2Settings_1.settingDisplayValue)(info, raw), 3);
        }
        this.extendedSettingsLoaded = true;
    }
    /**
     * CommandGetRAMVarInfo (protocol §7.3.9) for an arbitrary RAM id, cached per
     * connection. Sc = 0 means the variable is not supported by this firmware.
     */
    async getRamInfo(id) {
        const cached = this.ramInfoCache.get(id);
        if (cached) {
            return cached;
        }
        let sc = 0;
        let offset = 0;
        await this.conn.communicate(this.create_frame("W", Buffer.from([0x36, id & 0xFF, (id >> 8) & 0xFF])), async (response) => {
            if (response[1] != 0xff || response[2] != 0x57) {
                throw new Error("getRamInfo: not a Winmon response frame");
            }
            // Unsupported variables answer with only 0x8E <Sc=0> and no 0x8F
            // offset (§7.3.9), so the frame is shorter than the usual 0x08.
            // Parse by W frame content instead of by a fixed length.
            let seenScale = false;
            for (let i = 3; i + 2 < response.length; i += 3) {
                const cmd = response[i];
                const value = response[i + 1] | (response[i + 2] << 8);
                const signed = value >= 0x8000 ? value - 0x10000 : value;
                if (cmd == 0x8e) {
                    sc = signed;
                    seenScale = true;
                }
                else if (cmd == 0x8f) {
                    offset = signed;
                }
            }
            if (!seenScale) {
                throw new Error("getRamInfo: response carries no scale");
            }
        });
        const info = (0, mk2Ram_1.makeRamInfo)(id, sc, offset);
        this.ramInfoCache.set(id, info);
        return info;
    }
    /**
     * CommandReadRAMVar (protocol §7.3.3), one id per request. Returns null when
     * the firmware does not offer the variable; such ids are not polled again.
     */
    async readRamVar(id) {
        if (this.unsupportedRam.has(id)) {
            return null;
        }
        const info = await this.getRamInfo(id);
        if (!info.supported) {
            this.unsupportedRam.add(id);
            return null;
        }
        let raw = null;
        let unsupported = false;
        await this.conn.communicate(this.create_frame("W", Buffer.from([0x30, id & 0xFF])), async (response) => {
            if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57) {
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
        return round((0, mk2Ram_1.ramDisplayValue)(info, raw), 3);
    }
    /** Filtered power values and the internal battery monitor SOC (§7.3.13.1). */
    async readRamTelemetry() {
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
    async loadDeviceInfo(force = false) {
        if (this.deviceInfoLoaded && !force) {
            return;
        }
        this.mk2Model["info.mk2_version"].value = this.conn.mk2Version;
        this.mk2Model["info.mk2_mode"].value = this.conn.mk2Mode;
        const part0 = await this.readDeviceVersionPart(0x05, 0x82);
        const part1 = await this.readDeviceVersionPart(0x06, 0x83);
        if (part0 !== null && part1 !== null) {
            const version = ((part1 << 16) | part0) >>> 0;
            this.mk2Model["info.device_sw_version"].value = version;
            this.mk2Model["info.device_sw_version_text"].value = (0, mk2Ram_1.formatDeviceVersion)(version);
        }
        this.deviceInfoLoaded = true;
    }
    async readDeviceVersionPart(command, expected) {
        let part = null;
        await this.conn.communicate(this.create_frame("W", Buffer.from([command, 0x00, 0x00])), async (response) => {
            if (response[0] != 0x05 || response[1] != 0xff || response[2] != 0x57 || response[3] != expected) {
                throw new Error(`readDeviceVersionPart 0x${command.toString(16)}: no valid response`);
            }
            part = bp.unpack("<H", response, 4)[0];
        });
        return part;
    }
    async get_flags() {
        this.log.debug("******   get_flags");
        const flags = await this.readFlags0();
        const flagMap = {
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
        // Bits 9, 10 and 12 are "not promoted options" and stay untouched.
        for (const [bit, key] of Object.entries(flagMap)) {
            this.mk2Model[key].value = (flags & (1 << parseInt(bit))) !== 0;
        }
        // Protocol §7.3.13.3: flags[7] must be the inverse of flags[3].
        const waveCheck = (flags & (1 << 3)) !== 0;
        const waveCheckInverted = (flags & (1 << 7)) !== 0;
        if (waveCheck === waveCheckInverted) {
            this.log.warn("Flags0 bit 3 and bit 7 are not inverted (wave check); device configuration is inconsistent");
        }
    }
    async set_flagDisableCharge(value) {
        return this.setFlags0Bit(6, value, "DisableCharge");
    }
    async set_flagWeakACInput(value) {
        return this.setFlags0Bit(14, value, "WeakACInput");
    }
    async set_flagDisableAES(value) {
        return this.setFlags0Bit(8, value, "DisableAES");
    }
    async set_flagAssistEnabled(value) {
        return this.setFlags0Bit(5, value, "AssistEnabled");
    }
    /**
     * Read-modify-write for one Flags0 bit: validate against the device support
     * mask, write, then read the register back and warn on a mismatch.
     */
    async setFlags0Bit(bit, value, name) {
        if (value !== 0 && value !== 1) {
            throw new errors_1.Mk2ValidationError(`${name}: value must be 0 or 1 (got ${value})`);
        }
        await this.assertFlagSupported(bit);
        const mask = 1 << bit;
        const flags = await this.readFlags0();
        await this.writeFlags0(value == 1 ? flags | mask : flags & ~mask);
        const readback = await this.readFlags0();
        if (((readback & mask) !== 0) !== (value == 1)) {
            throw new Error(`${name}: readback mismatch after write (wanted ${value})`);
        }
    }
    /** Same pattern for Flags1 (global flag numbers 16-31, setting id 1). */
    async setFlags1Bit(flag, value, name) {
        if (value !== 0 && value !== 1) {
            throw new errors_1.Mk2ValidationError(`${name}: value must be 0 or 1 (got ${value})`);
        }
        const bit = (0, mk2Settings_1.flags1Bit)(flag);
        const info = await this.getSettingInfo(1);
        if (!info.supported) {
            throw new errors_1.Mk2ValidationError("Flags1 is not supported by this device");
        }
        if (info.max !== null && (info.max & (1 << bit)) === 0) {
            throw new errors_1.Mk2ValidationError(`${name}: flag ${flag} is not supported by this device`);
        }
        const mask = 1 << bit;
        const flags = await this.readSetting(1);
        if (flags === null) {
            // Never read-modify-write from an assumed zero: that would clear every
            // unrelated Flags1 option on the device (review T11).
            throw new errors_1.Mk2ValidationError(`${name}: Flags1 register could not be read, refusing to write`);
        }
        await this.writeSetting(1, value == 1 ? flags | mask : flags & ~mask);
        const readback = await this.readSetting(1);
        if (readback === null) {
            throw new Error(`${name}: no Flags1 readback after write`);
        }
        if (((readback & mask) !== 0) !== (value == 1)) {
            throw new Error(`${name}: readback mismatch after write (wanted ${value})`);
        }
    }
    async set_flagDynamicCurrentLimiter(value) {
        return this.setFlags1Bit(28, value, "DynamicCurrentLimiter");
    }
    /**
     * Write a scaled setting (charge voltages, AC input limits) using the device
     * metadata: display -> raw conversion, device min/max validation, write and
     * readback. Also refreshes the read-only setting state.
     */
    async setSettingScaled(id, value, name) {
        var _a, _b;
        if (!Number.isFinite(value)) {
            throw new errors_1.Mk2ValidationError(`${name}: invalid value ${value}`);
        }
        const info = await this.getSettingInfo(id);
        if (!info.supported) {
            throw new errors_1.Mk2ValidationError(`${name}: not supported by this device`);
        }
        const raw = (0, mk2Settings_1.settingRawValue)(info, value);
        const min = (_a = info.min) !== null && _a !== void 0 ? _a : 0;
        const max = (_b = info.max) !== null && _b !== void 0 ? _b : 0xffff;
        if (raw < min || raw > max) {
            throw new errors_1.Mk2ValidationError(`${name}: ${value} is out of the device range (raw ${min}-${max})`);
        }
        await this.writeSetting(id, raw);
        const readback = await this.readSetting(id);
        if (readback === null) {
            this.log.warn(`${name}: no readback after write`);
            return;
        }
        if (readback !== raw) {
            throw new Error(`${name}: readback mismatch (wrote raw ${raw}, device reports ${readback})`);
        }
        const def = mk2Settings_1.READONLY_SETTINGS.find((d) => d.id === id);
        if (def) {
            this.mk2Model[def.key].value = round((0, mk2Settings_1.settingDisplayValue)(info, readback), 3);
        }
    }
    async set_UBatAbsorption(value) {
        return this.setSettingScaled(2, value, "UBatAbsorption");
    }
    async set_UBatFloat(value) {
        return this.setSettingScaled(3, value, "UBatFloat");
    }
    async set_IMainsLimitAC1(value) {
        return this.setSettingScaled(6, value, "IMainsLimitAC1");
    }
    async get_setting_IBatBulk() {
        this.log.debug("******   get_setting_IBatBulk");
        const info = await this.getSettingInfo(4);
        const raw = await this.readSetting(4);
        this.mk2Model["setting.IBatBulk"].value =
            raw === null ? null : info.supported ? round((0, mk2Settings_1.settingDisplayValue)(info, raw), 2) : raw;
    }
    async set_setting_IBatBulk(value) {
        var _a, _b;
        this.log.debug("******   set_setting_IBatBulk value: " + value);
        if (!Number.isInteger(value)) {
            throw new errors_1.Mk2ValidationError(`IBatBulk must be an integer (got ${value})`);
        }
        const info = await this.getSettingInfo(4);
        if (!info.supported) {
            throw new errors_1.Mk2ValidationError("IBatBulk is not supported by this device");
        }
        // Device limits come from GetSettingInfo; 0-120 A is only the fallback for
        // firmware that does not report them.
        const raw = (0, mk2Settings_1.settingRawValue)(info, value);
        const min = (_a = info.min) !== null && _a !== void 0 ? _a : 0;
        const max = (_b = info.max) !== null && _b !== void 0 ? _b : 120;
        if (raw < min || raw > max) {
            throw new errors_1.Mk2ValidationError(`IBatBulk must be between ${min} and ${max} (got ${value})`);
        }
        await this.writeSetting(4, raw);
        const readback = await this.readSetting(4);
        if (readback !== null && readback !== raw) {
            throw new Error(`IBatBulk: readback mismatch (wrote raw ${raw}, device reports ${readback})`);
        }
        if (readback !== null) {
            this.mk2Model["setting.IBatBulk"].value = round((0, mk2Settings_1.settingDisplayValue)(info, readback), 2);
        }
    }
}
exports.Mk2Protocol = Mk2Protocol;
//# sourceMappingURL=mk2Protocol.js.map