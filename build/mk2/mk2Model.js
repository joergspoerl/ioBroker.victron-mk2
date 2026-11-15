"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mk2Model = exports.led = void 0;
const mk2Settings_1 = require("./mk2Settings");
const mk2Switch_1 = require("./mk2Switch");
var led;
(function (led) {
    led[led["OFF"] = 0] = "OFF";
    led[led["ON"] = 1] = "ON";
    led[led["BLINK_ANTI"] = 2] = "BLINK_ANTI";
    led[led["BLINK"] = 3] = "BLINK";
    led[led["UNKNOWN"] = 4] = "UNKNOWN";
})(led || (exports.led = led = {}));
const led_states = {
    "0": "OFF",
    "1": "ON",
    "2": "BLINK_ANTI",
    "3": "BLINK",
    "4": "UNKNOWN"
};
class Mk2Model {
    constructor() {
        this["info.connection"] = {
            descr: "True after a successful poll, false when the MK2/MultiPlus did not answer",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["diag.timeouts"] = {
            descr: "Serial timeouts since adapter start",
            unit: "",
            role: "value",
            type: "number",
            value: 0,
        };
        this["diag.checksum_errors"] = {
            descr: "Frame checksum errors since adapter start",
            unit: "",
            role: "value",
            type: "number",
            value: 0,
        };
        this["diag.last_error"] = {
            descr: "Last serial/protocol error",
            unit: "",
            role: "state",
            type: "string",
            value: "",
        };
        this["info.mk2_version"] = { descr: "MK2 firmware version (from the version frame)",
            unit: "",
            role: "value",
            type: "number",
            value: null,
        };
        this["info.mk2_mode"] = {
            descr: "MK2 mode byte: 'W' (87) = VE 9-bit, otherwise the VE.Bus address",
            unit: "",
            role: "value",
            type: "number",
            value: null,
        };
        this["info.address"] = {
            descr: "VE.Bus device address currently used by the MK2",
            unit: "",
            role: "value",
            type: "number",
            value: null,
        };
        this["info.device_sw_version"] = {
            descr: "MultiPlus firmware version, raw 32-bit integer",
            unit: "",
            role: "value",
            type: "number",
            value: null,
        };
        this["info.device_sw_version_text"] = {
            descr: "MultiPlus firmware version as AA BB CCC (product, model, revision)",
            unit: "",
            role: "state",
            type: "string",
            value: null,
        };
        this["power.inverter"] = {
            descr: "Inverter power, filtered (positive = AC to DC/charging, negative = inverting)",
            unit: "W",
            role: "value",
            type: "number",
            value: null,
        };
        this["power.output"] = {
            descr: "AC output power, filtered (positive = towards the loads)",
            unit: "W",
            role: "value",
            type: "number",
            value: null,
        };
        this["battery.soc"] = {
            descr: "State of charge from the MultiPlus internal battery monitor",
            unit: "%",
            role: "value",
            type: "number",
            value: null,
        };
        this["dc_info.ubat"] = {
            descr: "Battery voltage",
            unit: "V",
            role: "value.voltage",
            type: "number",
            value: 0,
        };
        this["dc_info.ibat"] = {
            descr: "DC current used by the inverting devices (unsigned, F0 frame)",
            unit: "A",
            role: "value.current",
            type: "number",
            value: 0,
        };
        this["dc_info.icharge"] = {
            descr: "DC current provided by the charging devices (unsigned, F0 frame)",
            unit: "A",
            role: "value.current",
            type: "number",
            value: 0,
        };
        this["dc_info.ibat_net"] = {
            descr: "Net battery current = icharge - ibat (positive = charging)",
            unit: "A",
            role: "value.current",
            type: "number",
            value: 0,
        };
        this["dc_info.finv"] = {
            descr: "Inverter output frequency (0 = inverter off)",
            unit: "Hz",
            role: "value",
            type: "number",
            value: 0,
        };
        this["ac_info.umains"] = {
            descr: "Main voltage - shore connection",
            unit: "V",
            role: "value.voltage",
            type: "number",
            value: 0,
        };
        this["ac_info.imains"] = {
            descr: "Main current - shore connection",
            unit: "A",
            role: "value.current",
            type: "number",
            value: 0,
        };
        this["ac_info.fmains"] = {
            descr: "Main freqency",
            unit: "Hz",
            role: "value",
            type: "number",
            value: 0,
        };
        this["ac_info.uinv"] = {
            descr: "Inverter voltage",
            unit: "V",
            role: "value.voltage",
            type: "number",
            value: 0,
        };
        this["ac_info.iinv"] = {
            descr: "Inverter current",
            unit: "A",
            role: "value.current",
            type: "number",
            value: 0,
        };
        this["ac_info.phase_info"] = {
            descr: "Indicates which phase the received frame describes",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: {
                "5": "This frame describes L4.",
                "6": "This frame describes L3.",
                "7": "This frame describes L2.",
                "8": "This frame describes L1; there is 1 phase in this system.",
                "9": "This frame describes L1; there are 2 phases in this system.",
                "10": "This frame describes L1; there are 3 phases in this system.",
                "11": "This frame describes L1; there are 4 phases in this system.",
                "12": "This is a DC info frame.",
            }
        };
        this["ac_info.state"] = {
            descr: "AC info state (raw; only on Multi firmware >= 207, otherwise null; main state = state.state)",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
        };
        this["assist.minlimit"] = {
            descr: "Minimum input current limit",
            unit: "A",
            role: "value.current",
            type: "number",
            value: 0,
        };
        this["assist.maxlimit"] = {
            descr: "Maximum input current limit",
            unit: "A",
            role: "value.current",
            type: "number",
            value: 0,
        };
        this["assist.limit"] = {
            descr: "Actual input current limit",
            unit: "A",
            role: "value.current",
            type: "number",
            value: 0,
        };
        this["switch.state"] = {
            descr: "Panel switch state derived from the switch register (device is authoritative)",
            unit: "",
            role: "value",
            type: "number",
            value: 3,
            states: mk2Switch_1.SWITCH_STATE_NAMES,
        };
        this["switch.DirectRemoteSwitchCharge"] = {
            descr: "Switch states",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: {
                "0": "OFF",
                "1": "ON",
            }
        };
        this["switch.DirectRemoteSwitchInvert"] = {
            descr: "Switch states",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: {
                "0": "OFF",
                "1": "ON",
            }
        };
        this["switch.FrontSwitchUp"] = {
            descr: "Switch states",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: {
                "0": "OFF",
                "1": "ON",
            }
        };
        this["switch.FrontSwitchDown"] = {
            descr: "Switch states",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: {
                "0": "OFF",
                "1": "ON",
            }
        };
        this["switch.SwitchCharge"] = {
            descr: "Switch states",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: {
                "0": "OFF",
                "1": "ON",
            }
        };
        this["switch.SwitchInvert"] = {
            descr: "Switch states",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: {
                "0": "OFF",
                "1": "ON",
            }
        };
        this["switch.OnboardRemoteInvertSwitch"] = {
            descr: "Switch states",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: {
                "0": "OFF",
                "1": "ON",
            }
        };
        this["switch.RemoteGeneratorSelected"] = {
            descr: "Switch states",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: {
                "0": "OFF",
                "1": "ON",
            }
        };
        this["state.state"] = {
            descr: "Main state and charge sub-state, encoded as mainState*10 + subState (protocol §7.3.2)",
            unit: "",
            role: "value",
            type: "number",
            value: 0,
            states: {
                "00": "down",
                "10": "startup",
                "20": "off",
                "30": "slave",
                "40": "invert full",
                "50": "invert half",
                "60": "invert aes",
                "70": "assist",
                "80": "bypass",
                "90": "charge init",
                "91": "charge bulk",
                "92": "charge absorption",
                "93": "charge float",
                "94": "charge storage",
                "95": "charge repeated absorption",
                "96": "charge forced absorption",
                "97": "charge equalise",
                "98": "charge bulk stopped",
            }
        };
        this["state.substate"] = {
            descr: "Charge sub-state from the 0x94 response (0 while not charging)",
            unit: "",
            role: "value",
            type: "number",
            value: 0,
            states: {
                "0": "none / not charging",
                "1": "bulk",
                "2": "absorption",
                "3": "float",
                "4": "storage",
                "5": "repeated absorption",
                "6": "forced absorption",
                "7": "equalise",
                "8": "bulk stopped",
            }
        };
        this["led.mains"] = {
            descr: "",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: led_states
        };
        this["led.absorption"] = {
            descr: "",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: led_states
        };
        this["led.bulk"] = {
            descr: "",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: led_states
        };
        this["led.float"] = {
            descr: "",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: led_states
        };
        this["led.inverter"] = {
            descr: "",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: led_states
        };
        this["led.overload"] = {
            descr: "",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: led_states
        };
        this["led.low_bat"] = {
            descr: "",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: led_states
        };
        this["led.temp"] = {
            descr: "",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: led_states
        };
        this["control.set_assist"] = {
            descr: "Set input current limit (A; 0 = Inverter/Zero grid when PowerAssist enabled)",
            unit: "A",
            role: "value.current",
            type: "number",
            value: 0,
            setFunc: (mk2, value) => mk2.set_assist(value)
        };
        this["control.switch_state"] = {
            descr: "VE.Bus switch state (1=Charger only, 2=Inverter only, 3=On, 4=Off)",
            unit: "",
            role: "state",
            type: "number",
            value: 3,
            states: {
                "1": "Charger only",
                "2": "Inverter only",
                "3": "On",
                "4": "Off"
            },
            setFunc: (mk2, value) => mk2.set_switch_state(value)
        };
        this["control.grid_mode"] = {
            descr: "Grid mode (0=Grid, 1=Zero grid/Invert via 0 A, 2=Inverter only)",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: {
                "0": "Grid",
                "1": "Zero grid / Invert",
                "2": "Inverter only"
            },
            setFunc: (mk2, value) => mk2.set_grid_mode(value)
        };
        this["control.force_state"] = {
            descr: "force a spezific state",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: {
                "1": "forced equalise",
                "2": "forced absorption",
                "3": "forced float"
            },
            setFunc: (mk2, value) => mk2.force_state(value)
        };
        this["control.IBatBulk"] = {
            descr: "IBatBulk",
            unit: "A",
            role: "state",
            type: "number",
            value: 0,
            setFunc: (mk2, value) => mk2.set_setting_IBatBulk(value)
        };
        this["control.DisableCharge"] = {
            descr: "DisableCharge",
            unit: "",
            role: "state",
            type: "number",
            value: null,
            states: {
                "0": "OFF",
                "1": "ON",
            },
            setFunc: (mk2, value) => mk2.set_flagDisableCharge(value)
        };
        this["control.WeakACInput"] = {
            descr: "WeakACInput",
            unit: "",
            role: "state",
            type: "number",
            value: null,
            states: {
                "0": "OFF",
                "1": "ON",
            },
            setFunc: (mk2, value) => mk2.set_flagWeakACInput(value)
        };
        this["control.DisableAES"] = {
            descr: "Disable AES (Automatic Economy Switch); Flags0 bit 8",
            unit: "",
            role: "state",
            type: "number",
            value: null,
            states: {
                "0": "AES enabled",
                "1": "AES disabled",
            },
            setFunc: (mk2, value) => mk2.set_flagDisableAES(value)
        };
        this["control.AssistEnabled"] = {
            descr: "PowerAssist enabled; Flags0 bit 5",
            unit: "",
            role: "state",
            type: "number",
            value: null,
            states: {
                "0": "OFF",
                "1": "ON",
            },
            setFunc: (mk2, value) => mk2.set_flagAssistEnabled(value)
        };
        this["control.DynamicCurrentLimiter"] = {
            descr: "Dynamic current limiter; Flags1 bit 12 (flag 28)",
            unit: "",
            role: "state",
            type: "number",
            value: null,
            states: {
                "0": "OFF",
                "1": "ON",
            },
            setFunc: (mk2, value) => mk2.set_flagDynamicCurrentLimiter(value)
        };
        this["control.UBatAbsorption"] = {
            descr: "Absorption voltage (device range from GetSettingInfo)",
            unit: "V",
            role: "value.voltage",
            type: "number",
            value: null,
            setFunc: (mk2, value) => mk2.set_UBatAbsorption(value)
        };
        this["control.UBatFloat"] = {
            descr: "Float voltage (device range from GetSettingInfo)",
            unit: "V",
            role: "value.voltage",
            type: "number",
            value: null,
            setFunc: (mk2, value) => mk2.set_UBatFloat(value)
        };
        this["control.IMainsLimitAC1"] = {
            descr: "Configured AC1 input current limit (device range from GetSettingInfo)",
            unit: "A",
            role: "value.current",
            type: "number",
            value: null,
            setFunc: (mk2, value) => mk2.set_IMainsLimitAC1(value)
        };
        this["setting.flag.MultiPhaseSystem"] = {
            descr: "MultiPhaseSystem",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["setting.flag.MultiPhaseLeader"] = {
            descr: "MultiPhaseLeader",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["setting.flag.Freq60Hz"] = {
            descr: "60Hz",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["setting.flag.DoNotStopAfter10HrBulk"] = {
            descr: "DoNotStopAfter10HrBulk",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["setting.flag.AssistEnabled"] = {
            descr: "AssistEnabled",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["setting.flag.DisableCharge"] = {
            descr: "DisableCharge",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["setting.flag.DisableAES"] = {
            descr: "DisableAES",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["setting.flag.EnableReducedFloat"] = {
            descr: "EnableReducedFloat",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["setting.flag.DisableGroundRelay"] = {
            descr: "Disable ground relay",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["setting.flag.WeakACInput"] = {
            descr: "Weak AC input",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["setting.flag.RemoteOverrulesAC2"] = {
            descr: "Remote overrules AC2",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["setting.flag.DisableWaveCheck"] = {
            descr: "Disable wave check / fast input voltage detection (Flags0 bit 3)",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["setting.flag.WaveCheckInverted"] = {
            descr: "Flags0 bit 7; must be the inverse of DisableWaveCheck (protocol §7.3.13.3)",
            unit: "",
            role: "state",
            type: "boolean",
            value: null,
        };
        this["setting.IBatBulk"] = {
            descr: "IBatBulk",
            unit: "A",
            role: "state",
            type: "number",
            value: 0,
            // setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_setting_IBatBulk(value)
        };
        // Read-only settings and Flags1 are declared in mk2Settings.ts so the
        // protocol table and the ioBroker objects cannot drift apart.
        for (const def of mk2Settings_1.READONLY_SETTINGS) {
            this[def.key] = {
                descr: def.descr + " (read-only)",
                unit: def.unit,
                role: def.role,
                type: "number",
                value: null,
            };
        }
        for (const def of mk2Settings_1.FLAGS1) {
            this[def.key] = {
                descr: def.descr + " (Flags1)",
                unit: "",
                role: "state",
                type: "boolean",
                value: null,
            };
        }
    }
}
exports.Mk2Model = Mk2Model;
//# sourceMappingURL=mk2Model.js.map