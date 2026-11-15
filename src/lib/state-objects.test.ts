import { expect } from "chai";
import { buildStateObject } from "./state-objects";

describe("state objects", () => {
	it("uses the model role and unit", () => {
		const obj = buildStateObject("dc_info.ubat", {
			descr: "Battery voltage",
			unit: "V",
			role: "value.voltage",
			type: "number",
			value: 0,
		} as any);
		expect(obj.common.role).to.equal("value.voltage");
		expect(obj.common.unit).to.equal("V");
		expect(obj.common.write).to.equal(false);
	});

	it("adds states for enumerated controls", () => {
		const obj = buildStateObject("control.grid_mode", {
			descr: "Grid mode",
			unit: "",
			role: "state",
			type: "number",
			value: 0,
			states: { "0": "Grid", "1": "Zero grid" },
			setFunc: async () => undefined,
		} as any);
		expect(obj.common.states).to.deep.equal({ "0": "Grid", "1": "Zero grid" });
		expect(obj.common.write).to.equal(true);
	});

	it("sets min/max/def for control.set_assist", () => {
		const obj = buildStateObject("control.set_assist", {
			descr: "Set input current limit",
			unit: "A",
			role: "value.current",
			type: "number",
			value: 0,
			setFunc: async () => undefined,
		} as any);
		expect(obj.common.min).to.equal(0);
		expect(obj.common.max).to.equal(16);
		expect(obj.common.def).to.equal(16);
	});
});
