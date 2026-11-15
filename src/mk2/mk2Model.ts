import { Mk2Protocol } from "./mk2Protocol";
import { FLAGS1, READONLY_SETTINGS } from "./mk2Settings";
import { SWITCH_STATE_NAMES } from "./mk2Switch";

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

export type ioBrokerRole = "state" | "value.current" | "value.voltage" | "value" | "value.temperature" | "indicator.connected"

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

	constructor() {
		// Read-only settings and Flags1 are declared in mk2Settings.ts so the
		// protocol table and the ioBroker objects cannot drift apart.
		for (const def of READONLY_SETTINGS) {
			this[def.key] = {
				descr: def.descr + " (read-only)",
				unit: def.unit,
				role: def.role,
				type: "number",
				value: null,
			};
		}
		for (const def of FLAGS1) {
			this[def.key] = {
				descr: def.descr + " (Flags1)",
				unit: "",
				role: "state",
				type: "boolean",
				value: null,
			};
		}
	}

	"info.connection":    Mk2DataEntry = {
		descr: "True after a successful poll, false when the MK2/MultiPlus did not answer",
		unit:  "",
		role:  "indicator.connected",
		type: "boolean",
		value: null,
	};

	"diag.timeouts":    Mk2DataEntry = {
		descr: "Serial timeouts since adapter start",
		unit:  "",
		role:  "value",
		type: "number",
		value: 0,
	};

	"diag.checksum_errors":    Mk2DataEntry = {
		descr: "Frame checksum errors since adapter start",
		unit:  "",
		role:  "value",
		type: "number",
		value: 0,
	};

	"diag.last_error":    Mk2DataEntry = {
		descr: "Last serial/protocol error",
		unit:  "",
		role:  "state",
		type: "string",
		value: "",
	};

	"diag.protocol_errors":    Mk2DataEntry = {
		descr: "Protocol/stream errors (e.g. invalid frame length) since adapter start",
		unit:  "",
		role:  "value",
		type: "number",
		value: 0,
	};

	"diag.sync_errors":    Mk2DataEntry = {
		descr: "Failed MK2 synchronisations (no version frame) since adapter start",
		unit:  "",
		role:  "value",
		type: "number",
		value: 0,
	};

	"diag.last_control_error":    Mk2DataEntry = {
		descr: "Last dropped/failed control write as 'state: reason' (empty after a successful write)",
		unit:  "",
		role:  "state",
		type: "string",
		value: "",
	};

	"info.mk2_version":    Mk2DataEntry = {		descr: "MK2 firmware version (from the version frame)",
		unit:  "",
		role:  "value",
		type: "number",
		value: null,
	};

	"info.mk2_mode":    Mk2DataEntry = {
		descr: "MK2 mode byte: 'W' (87) = VE 9-bit, otherwise the VE.Bus address",
		unit:  "",
		role:  "value",
		type: "number",
		value: null,
	};

	"info.address":    Mk2DataEntry = {
		descr: "VE.Bus device address currently used by the MK2",
		unit:  "",
		role:  "value",
		type: "number",
		value: null,
	};

	"info.device_sw_version":    Mk2DataEntry = {
		descr: "MultiPlus firmware version, raw 32-bit integer",
		unit:  "",
		role:  "value",
		type: "number",
		value: null,
	};

	"info.device_sw_version_text":    Mk2DataEntry = {
		descr: "MultiPlus firmware version as AA BB CCC (product, model, revision)",
		unit:  "",
		role:  "state",
		type: "string",
		value: null,
	};

	"power.inverter":    Mk2DataEntry = {
		descr: "Inverter power, filtered (positive = AC to DC/charging, negative = inverting)",
		unit:  "W",
		role:  "value",
		type: "number",
		value: null,
	};

	"power.output":    Mk2DataEntry = {
		descr: "AC output power, filtered (positive = towards the loads)",
		unit:  "W",
		role:  "value",
		type: "number",
		value: null,
	};

	"battery.soc":    Mk2DataEntry = {
		descr: "SOC of the MultiPlus internal battery monitor - NOT the BMV; reads 0 % when the internal monitor is not configured",
		unit:  "%",
		role:  "value",
		type: "number",
		value: null,
	};

 	"dc_info.ubat":    Mk2DataEntry = {
		descr: "Battery voltage",
		unit:  "V",
		role:  "value.voltage",
		type: "number",
		value: null,
	};

	"dc_info.ibat":    Mk2DataEntry = {
		descr: "DC current used by the inverting devices (unsigned, F0 frame)",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: null,
	};

	"dc_info.icharge":    Mk2DataEntry = {
		descr: "DC current provided by the charging devices (unsigned, F0 frame)",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: null,
	};

	"dc_info.ibat_net":    Mk2DataEntry = {
		descr: "Net battery current = icharge - ibat (positive = charging)",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: null,
	};

	"dc_info.finv":    Mk2DataEntry = {
		descr: "Inverter output frequency (0 = inverter off)",
		unit:  "Hz",
		role:  "value",
		type: "number",
		value: null,
	};

	"ac_info.umains":    Mk2DataEntry = {
		descr: "Main voltage - shore connection",
		unit:  "V",
		role:  "value.voltage",
		type: "number",
		value: null,
	};

	"ac_info.imains":    Mk2DataEntry = {
		descr: "Main current - shore connection",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: null,
	};

	"ac_info.fmains":    Mk2DataEntry = {
		descr: "Main freqency",
		unit:  "Hz",
		role:  "value",
		type: "number",
		value: null,
	};

	"ac_info.uinv":    Mk2DataEntry = {
		descr: "Inverter voltage",
		unit:  "V",
		role:  "value.voltage",
		type: "number",
		value: null,
	};


	"ac_info.iinv":    Mk2DataEntry = {
		descr: "Inverter current",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: null,
	};

	"ac_info.phase_info":    Mk2DataEntry = {
		descr: "Indicates which phase the received frame describes",
		unit:  "",
		role:  "state",
		type: "number",
		value: null,
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
		descr: "AC info state (raw; only on Multi firmware >= 207, otherwise null; main state = state.state)",
		unit:  "",
		role:  "state",
		type: "number",
		value: null,
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
		descr: "Actual input current limit; after a 0 A write it shows the device minimum (e.g. 3.1 A) although Invert mode is active",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: 0,
	};

	"switch.state":    Mk2DataEntry = {
		descr: "Panel switch state derived from the switch register (device is authoritative)",
		unit:  "",
		role:  "value",
		type: "number",
		value: 3,
		states: SWITCH_STATE_NAMES,
	};

	"switch.DirectRemoteSwitchCharge":    Mk2DataEntry = {
		descr: "Direct remote switch: charge",
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
		descr: "Direct remote switch: invert",
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
		descr: "Front switch up",
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
		descr: "Front switch down",
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
		descr: "Switch register: charge enabled",
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
		descr: "Switch register: inverter enabled",
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
		descr: "Onboard remote inverter switch",
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
		descr: "Remote generator selected",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "OFF",
			"1": "ON",
		}
	};

	"state.state":    Mk2DataEntry = {
		descr: "Main state and charge sub-state, encoded as mainState*10 + subState (protocol §7.3.2)",
		unit:  "",
		role:  "value",
		type: "number",
		value: 0,
		states:  {
			"0": "down",
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


	"state.substate":    Mk2DataEntry = {
		descr: "Charge sub-state from the 0x94 response (0 while not charging)",
		unit:  "",
		role:  "value",
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
		descr: "Set input current limit (A; 0 = Inverter/Zero grid when PowerAssist enabled)",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: 0,
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_assist(value)
	};

	"control.switch_state":    Mk2DataEntry = {
		descr: "VE.Bus switch state (1=Charger only, 2=Inverter only, 3=On, 4=Off)",
		unit:  "",
		role:  "state",
		type: "number",
		value: 3,
		states: {
			"1": "Charger only",
			"2": "Inverter only",
			"3": "On",
			"4": "Off"
		},
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_switch_state(value)
	};

	"control.grid_mode":    Mk2DataEntry = {
		descr: "Grid mode (0=Grid, 1=Zero grid/Invert via 0 A [needs PowerAssist], 2=Inverter only [switch 2 + 0 A, the 0 A setpoint persists]). Switches the device on when it is Off.",
		unit:  "",
		role:  "state",
		type: "number",
		value: 0,
		states: {
			"0": "Grid",
			"1": "Zero grid / Invert",
			"2": "Inverter only"
		},
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_grid_mode(value)
	};

	"control.force_state":    Mk2DataEntry = {
		descr: "Force charge state: 1=Equalise (battery maintenance: 1 h at 1/2/4 V above absorption, 1/4 current), 2=Absorption, 3=Float. Not an on/off mode.",
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

	"control.IBatBulk":    Mk2DataEntry = {
		descr: "IBatBulk",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: 0,
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_setting_IBatBulk(value)
	};
	"control.DisableCharge":    Mk2DataEntry = {
		descr: "DisableCharge",
		unit:  "",
		role:  "state",
		type: "number",
		value: null,
		states: {
			"0": "OFF",
			"1": "ON",
		},
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_flagDisableCharge(value)
	};
	"control.WeakACInput":    Mk2DataEntry = {
		descr: "WeakACInput",
		unit:  "",
		role:  "state",
		type: "number",
		value: null,
		states: {
			"0": "OFF",
			"1": "ON",
		},
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_flagWeakACInput(value)
	};

	"control.DisableAES":    Mk2DataEntry = {
		descr: "Disable AES (Automatic Economy Switch); Flags0 bit 8",
		unit:  "",
		role:  "state",
		type: "number",
		value: null,
		states: {
			"0": "AES enabled",
			"1": "AES disabled",
		},
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_flagDisableAES(value)
	};

	"control.AssistEnabled":    Mk2DataEntry = {
		descr: "PowerAssist enabled; Flags0 bit 5",
		unit:  "",
		role:  "state",
		type: "number",
		value: null,
		states: {
			"0": "OFF",
			"1": "ON",
		},
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_flagAssistEnabled(value)
	};

	"control.DynamicCurrentLimiter":    Mk2DataEntry = {
		descr: "Dynamic current limiter; Flags1 bit 12 (flag 28)",
		unit:  "",
		role:  "state",
		type: "number",
		value: null,
		states: {
			"0": "OFF",
			"1": "ON",
		},
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_flagDynamicCurrentLimiter(value)
	};

	"control.UBatAbsorption":    Mk2DataEntry = {
		descr: "Absorption voltage (device range from GetSettingInfo)",
		unit:  "V",
		role:  "value.voltage",
		type: "number",
		value: null,
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_UBatAbsorption(value)
	};

	"control.UBatFloat":    Mk2DataEntry = {
		descr: "Float voltage (device range from GetSettingInfo)",
		unit:  "V",
		role:  "value.voltage",
		type: "number",
		value: null,
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_UBatFloat(value)
	};

	"control.IMainsLimitAC1":    Mk2DataEntry = {
		descr: "Configured AC1 input current limit (device range from GetSettingInfo)",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: null,
		setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_IMainsLimitAC1(value)
	};

	"setting.flag.MultiPhaseSystem":    Mk2DataEntry = {
		descr: "MultiPhaseSystem",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: null,
	};

	"setting.flag.MultiPhaseLeader":    Mk2DataEntry = {
		descr: "MultiPhaseLeader",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: null,
	};

	"setting.flag.Freq60Hz":    Mk2DataEntry = {
		descr: "60Hz",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: null,
	};

	"setting.flag.DoNotStopAfter10HrBulk":    Mk2DataEntry = {
		descr: "DoNotStopAfter10HrBulk",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: null,
	};


	"setting.flag.AssistEnabled":    Mk2DataEntry = {
		descr: "AssistEnabled",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: null,
	};


	"setting.flag.DisableCharge":    Mk2DataEntry = {
		descr: "DisableCharge",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: null,
	};

	"setting.flag.DisableAES":    Mk2DataEntry = {
		descr: "DisableAES",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: null,
	};

	"setting.flag.EnableReducedFloat":    Mk2DataEntry = {
		descr: "EnableReducedFloat",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: null,
	};

	"setting.flag.DisableGroundRelay":    Mk2DataEntry = {
		descr: "Disable ground relay",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: null,
	};

	"setting.flag.WeakACInput":    Mk2DataEntry = {
		descr: "Weak AC input",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: null,
	};

	"setting.flag.RemoteOverrulesAC2":    Mk2DataEntry = {
		descr: "Remote overrules AC2",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: null,
	};

	"setting.flag.DisableWaveCheck":    Mk2DataEntry = {
		descr: "Disable wave check / fast input voltage detection (Flags0 bit 3)",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: null,
	};

	"setting.flag.WaveCheckInverted":    Mk2DataEntry = {
		descr: "Flags0 bit 7; must be the inverse of DisableWaveCheck (protocol §7.3.13.3)",
		unit:  "",
		role:  "state",
		type: "boolean",
		value: null,
	};

	"setting.IBatBulk":    Mk2DataEntry = {
		descr: "IBatBulk",
		unit:  "A",
		role:  "value.current",
		type: "number",
		value: 0,
		// setFunc: (mk2: Mk2Protocol, value: number) => mk2.set_setting_IBatBulk(value)
	};

}
