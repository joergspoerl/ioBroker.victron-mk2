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

export enum led {
	"OFF" = 0,
	"ON" = 1,
	"BLINK_ANTI" = 2,
	"BLINK" = 3,
	"UNKNOWN" = 4,
}

const led_states = {
	"0" : "OFF",
	"1" : "ON",
	"2" : "BLINK_ANTI",
	"3" : "BLINK",
	"4" : "UNKNOWN"
}
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

	"ac_info.phase_info":    Mk2DataEntry = {
		descr: "Indicates which phase the received frame describes",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"5"  : "This frame describes L4.",
			"6"  : "This frame describes L3.",
			"7"  : "This frame describes L2.",
			"8"  : "This frame describes L1; there is 1 phase in this system.",
			"9"  : "This frame describes L1; there are 2 phases in this system.",
			"10" : "This frame describes L1; there are 3 phases in this system.",
			"11" : "This frame describes L1; there are 4 phases in this system.",
			"12" : "This is a DC info frame.",
		}
	};

	"ac_info.state":    Mk2DataEntry = {
		descr: "Indicates the Multi main state",
		unit:  "",
		role:  "state",
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

	"switch.DirectRemoteSwitchCharge":    Mk2DataEntry = {
		descr: "Switch states",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
		}
	};

	"switch.DirectRemoteSwitchInvert":    Mk2DataEntry = {
		descr: "Switch states",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
		}
	};
	"switch.FrontSwitchUp":    Mk2DataEntry = {
		descr: "Switch states",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
		}
	};
	"switch.FrontSwitchDown":    Mk2DataEntry = {
		descr: "Switch states",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
		}
	};
	"switch.SwitchCharge":    Mk2DataEntry = {
		descr: "Switch states",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
		}
	};

	"switch.SwitchInvert":    Mk2DataEntry = {
		descr: "Switch states",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
		}
	};
	"switch.OnboardRemoteInvertSwitch":    Mk2DataEntry = {
		descr: "Switch states",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
		}
	};

	"switch.RemoteGeneratorSelected":    Mk2DataEntry = {
		descr: "Switch states",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: false,
		states: {
			"0": "OFF",
			"1": "ON",
		}
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
		states: led_states
	};
	"led.absorption":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: led_states
	};
	"led.bulk":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: led_states
	};
	"led.float":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: led_states
	};
	"led.inverter":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: led_states
	};
	"led.overload":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: led_states
	};
	"led.low_bat":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: led_states
	};
	"led.temp":    Mk2DataEntry = {
		descr: "",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: led_states
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
