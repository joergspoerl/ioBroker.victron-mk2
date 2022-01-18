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
            unit: "V",
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
        };
        this["state.stateText"] = {
            descr: "state text",
            unit: "",
            role: "value",
            type: "string",
            value: 0,
        };
        this["state.substate"] = {
            descr: "substate number",
            unit: "",
            role: "value",
            type: "number",
            value: 0,
        };
        this["state.substateText"] = {
            descr: "substate text",
            unit: "",
            role: "value",
            type: "string",
            value: 0,
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