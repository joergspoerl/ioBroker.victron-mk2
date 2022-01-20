import { Mk2Protocol } from "./mk2Protocol";

export interface Mk2DataEntry {
	descr: string,
	unit: string;
	role: ioBrokerRole;
	type: ioBroker.CommonType //'number' | 'string' | 'boolean' | 'array' | 'object' | 'mixed' | 'file'
	value: Mk2PropertyType;
	states?: { [key: string]: string };
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

	"dc_info.finv":    Mk2DataEntry = {
		descr: "Inverter period",
		unit:  "Hz",
		role:  "state",
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
		unit:  "A",
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
		states:  {
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


	"led.mains":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
			"2": "BLINK",
		}
	};
	"led.absorption":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
			"2": "BLINK",
		}
	};
	"led.bulk":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
			"2": "BLINK",
		}
	};
	"led.float":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
			"2": "BLINK",
		}
	};
	"led.inverter":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
			"2": "BLINK",
		}
	};
	"led.overload":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
			"2": "BLINK",
		}
	};
	"led.low_bat":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
			"2": "BLINK",
		}
	};
	"led.temp":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
			"2": "BLINK",
		}
	};


	"control.set_assist":    Mk2DataEntry = {
		descr: "Set input current limit",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: 0,
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_assist(value)
	};

	"control.force_state":    Mk2DataEntry = {
		descr: "force a spezific state",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"1": "forced equalise",
			"2": "forced absorption",
			"3": "forced float"
		},
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.force_state(value)
	};





}
