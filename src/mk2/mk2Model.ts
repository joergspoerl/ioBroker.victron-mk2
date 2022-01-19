import { Mk2Protocol } from "./mk2Protocol";

export interface Mk2DataEntry {
	descr: string,
	unit: string;
	role: ioBrokerRole;
	type: ioBroker.CommonType //'number' | 'string' | 'boolean' | 'array' | 'object' | 'mixed' | 'file'
	value: Mk2PropertyType;
	valueOld?: Mk2PropertyType;
	setFunc?:  (protocol: Mk2Protocol, value: number) => Promise<void>
}

export type Mk2PropertyType = number | string | boolean | null; // entspricht ioBroker.StateValue

export type ioBrokerRole = "state" | "value.current" | "value.voltage" | "value" | "value.temperature"


export class Mk2Model {
	[key: string]: Mk2DataEntry

 	"dc_info.ubat":    Mk2DataEntry = {
		descr: "Battery voltage",
		unit:  "V",
		role:  "value.voltage",
		type: "number",
		value: 0,
	};

	"dc_info.ibat":    Mk2DataEntry = {
		descr: "Current from battery",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: 0,
	};

	"dc_info.icharge":    Mk2DataEntry = {
		descr: "Charging current to battery",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: 0,
	};

	"ac_info.umains":    Mk2DataEntry = {
		descr: "Main voltage - shore connection",
		unit:  "V",
		role:  "value.voltage",
		type: "number",
		value: 0,
	};

	"ac_info.imains":    Mk2DataEntry = {
		descr: "Main current - shore connection",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: 0,
	};

	"ac_info.fmains":    Mk2DataEntry = {
		descr: "Main frequncy",
		unit:  "Hz",
		role:  "value",
		type: "number",
		value: 0,
	};

	"ac_info.uinv":    Mk2DataEntry = {
		descr: "Inverter voltage",
		unit:  "V",
		role:  "value.voltage",
		type: "number",
		value: 0,
	};

	"ac_info.iinv":    Mk2DataEntry = {
		descr: "Inverter current",
		unit:  "V",
		role:  "value.current",
		type: "number",
		value: 0,
	};

	"ac_info.finv":    Mk2DataEntry = {
		descr: "Inverter frequncy",
		unit:  "Hz",
		role:  "value",
		type: "number",
		value: 0,
	};

	"assist.minlimit":    Mk2DataEntry = {
		descr: "Minimum input current limit",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: 0,
	};

	"assist.maxlimit":    Mk2DataEntry = {
		descr: "Maximum input current limit",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: 0,
	};

	"assist.limit":    Mk2DataEntry = {
		descr: "Actual input current limit",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: 0,
	};


	"state.state":    Mk2DataEntry = {
		descr: "state number",
		unit:  "",
		role:  "value",
		type: "number",
		value: 0,
	};

	"state.stateText":    Mk2DataEntry = {
		descr: "state text",
		unit:  "",
		role:  "value",
		type: "string",
		value: 0,
	};

	"state.substate":    Mk2DataEntry = {
		descr: "substate number",
		unit:  "",
		role:  "value",
		type: "number",
		value: 0,
	};

	"state.substateText":    Mk2DataEntry = {
		descr: "substate text",
		unit:  "",
		role:  "value",
		type: "string",
		value: 0,
	};

	"state.forcestate":    Mk2DataEntry = {
		descr: "force a spezific state",
		unit:  "",
		role:  "value",
		type: "number",
		value: 0,
	};

	"led.mains":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "value",
		type: "string",
		value: "",
	};
	"led.absorption":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "value",
		type: "string",
		value: "",
	};
	"led.bulk":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "value",
		type: "string",
		value: "",
	};
	"led.float":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "value",
		type: "string",
		value: "",
	};
	"led.inverter":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "value",
		type: "string",
		value: "",
	};
	"led.overload":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "value",
		type: "string",
		value: "",
	};
	"led.low_bat":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "value",
		type: "string",
		value: "",
	};
	"led.temp":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "value",
		type: "string",
		value: "",
	};


	"control.set_assist":    Mk2DataEntry = {
		descr: "Set input current limit",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: 0,
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_assist(value)
	};

	"frame.address":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "string",
		value: "",
	};

	"frame.led_status":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "string",
		value: "",
	};

	"frame.master_multi_led_info":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "string",
		value: "",
	};

	"frame.get_state":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "string",
		value: "",
	};

	"frame.set_assist":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "string",
		value: "",
	};


}
