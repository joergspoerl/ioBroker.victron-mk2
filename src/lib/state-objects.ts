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
		common.max = 16;
		common.def = 16;
	}
	return {
		type: "state",
		common,
		native: {},
	};
}
