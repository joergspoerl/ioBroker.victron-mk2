"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mk2Model = void 0;
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
        this["dc_info.finv"] = {
            descr: "Inverter period",
            unit: "Hz",
            role: "state",
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
            descr: "Main frequncy",
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
        this["ac_info.finv"] = {
            descr: "Inverter frequncy",
            unit: "Hz",
            role: "value",
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
        this["state.forcestate"] = {
            descr: "force a spezific state",
            unit: "",
            role: "value",
            type: "number",
            value: 0,
        };
        this["led.mains"] = {
            descr: "",
            unit: "",
            role: "value",
            type: "string",
            value: "",
        };
        this["led.absorption"] = {
            descr: "",
            unit: "",
            role: "value",
            type: "string",
            value: "",
        };
        this["led.bulk"] = {
            descr: "",
            unit: "",
            role: "value",
            type: "string",
            value: "",
        };
        this["led.float"] = {
            descr: "",
            unit: "",
            role: "value",
            type: "string",
            value: "",
        };
        this["led.inverter"] = {
            descr: "",
            unit: "",
            role: "value",
            type: "string",
            value: "",
        };
        this["led.overload"] = {
            descr: "",
            unit: "",
            role: "value",
            type: "string",
            value: "",
        };
        this["led.low_bat"] = {
            descr: "",
            unit: "",
            role: "value",
            type: "string",
            value: "",
        };
        this["led.temp"] = {
            descr: "",
            unit: "",
            role: "value",
            type: "string",
            value: "",
        };
        this["control.set_assist"] = {
            descr: "Set input current limit",
            unit: "A",
            role: "value.current",
            type: "number",
            value: 0,
            setFunc: (mk2, value) => mk2.set_assist(value)
        };
    }
}
exports.Mk2Model = Mk2Model;
//# sourceMappingURL=mk2Model.js.map