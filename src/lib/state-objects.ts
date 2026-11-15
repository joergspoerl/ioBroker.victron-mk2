import { Mk2DataEntry } from "../mk2/mk2Model";

/** Build the ioBroker state object from the model definition. */
export function buildStateObject(key: string, v: Mk2DataEntry): any {
	const common: any = {
		name: v.descr,
		type: v.type,
		role: v.role,
		read: true,
		write: !!v.setFunc,
		unit: v.unit,
	};
	if (v.states) {
		common.states = v.states;
	}
	if (key === "control.set_assist") {
		common.min = 0;
		// max/def are set from assist.maxlimit after device discovery (N4);
		// a static default here would reset them on every adapter start.
	}
	return {
		type: "state",
		common,
		native: {},
	};
}

/**
 * True when the model definition differs from the stored object and therefore
 * needs an upgrade. Only definition fields are compared: user customisation
 * (e.g. `common.custom` for InfluxDB history) must not trigger or be overwritten.
 */
export function objectDefinitionChanged(existing: any, next: any): boolean {
	const fields = ["name", "type", "role", "read", "write", "unit", "states", "min", "max", "def"];
	for (const field of fields) {
		const before = JSON.stringify(existing?.common?.[field] ?? null);
		const after = JSON.stringify(next?.common?.[field] ?? null);
		if (before !== after) {
			return true;
		}
	}
	return false;
}

