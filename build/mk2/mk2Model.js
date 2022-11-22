"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mk2Model = exports.led = void 0;
var led;
(function (led) {
    led[led["OFF"] = 0] = "OFF";
    led[led["ON"] = 1] = "ON";
    led[led["BLINK_ANTI"] = 2] = "BLINK_ANTI";
    led[led["BLINK"] = 3] = "BLINK";
    led[led["UNKNOWN"] = 4] = "UNKNOWN";
})(led = exports.led || (exports.led = {}));
const led_states = {
    "0": "OFF",
    "1": "ON",
    "2": "BLINK_ANTI",
    "3": "BLINK",
    "4": "UNKNOWN"
};
class Mk2Model {
    constructor() {
        this["dc_info.ubat"] = {
            descr: "Battery voltage",
            unit: "V",
            role: "value.voltage",
            type: "number",
            value: 0,
        };
        this["dc_info.ibat"] = {
            descr: "Current from battery",
            unit: "A",
            role: "value.current",
            type: "number",
            value: 0,
        };
        this["dc_info.icharge"] = {
            descr: "Charging current to battery",
            unit: "A",
            role: "value.current",
            type: "number",
            value: 0,
        };
        // "dc_info.finv":    Mk2DataEntry = {
        // 	descr: "Inverter period",
        // 	unit:  "Hz",
        // 	role:  "state",
        // 	type: "number",
        // 	value: 0,
        // };
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
            descr: "Indicates the Multi main state",
            unit: "",
            role: "state",
            type: "number",
            value: 0,
            states: {
                "0": "Down",
                "1": "Startup",
                "2": "Off",
                "3": "Slave",
                "4": "InvertFull",
                "5": "InvertHalf",
                "6": "InvertAES",
                "7": "PowerAssist",
                "8": "Bypass",
                "9": "StateCharge",
            }
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
            descr: "state number",
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
        // "power.charger":    Mk2DataEntry = {
        // 	descr: "Pharger power being transformed from AC to DC or vice versa",
        // 	unit:  "W",
        // 	role:  "value",
        // 	type: "number",
        // 	value: 0,
        // };
        // "power.inverter":    Mk2DataEntry = {
        // 	descr: "Inverter power being transformed from AC to DC or vice versa",
        // 	unit:  "W",
        // 	role:  "value",
        // 	type: "number",
        // 	value: 0,
        // };
        // "power.output":    Mk2DataEntry = {
        // 	descr: "Output power going into or out of the Multi/Quatrro on the AC output port to the loads.",
        // 	unit:  "W",
        // 	role:  "value",
        // 	type: "number",
        // 	value: 0,
        // };
        this["control.set_assist"] = {
            descr: "Set input current limit",
            unit: "A",
            role: "value.current",
            type: "number",
            value: 0,
            setFunc: (mk2, value) => mk2.set_assist(value)
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
        this["setting.IBatBulk"] = {
            descr: "IBatBulk",
            unit: "A",
            role: "state",
            type: "number",
            value: 0,
            // setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_setting_IBatBulk(value)
        };
    }
}
exports.Mk2Model = Mk2Model;
//# sourceMappingURL=mk2Model.js.map