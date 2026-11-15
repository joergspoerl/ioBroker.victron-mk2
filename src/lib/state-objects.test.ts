import { expect } from "chai";
import { buildStateObject, objectDefinitionChanged } from "./state-objects";

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

	it("sets only min for control.set_assist; max/def come from the device (issue #60)", () => {
		const obj = buildStateObject("control.set_assist", {
			descr: "Set input current limit",
			unit: "A",
			role: "value.current",
			type: "number",
			value: 0,
			setFunc: async () => undefined,
		} as any);
		expect(obj.common.min).to.equal(0);
		expect(obj.common.max).to.equal(undefined);
		expect(obj.common.def).to.equal(undefined);
	});

	it("detects definition changes for object upgrades (issue #19)", () => {
		const entry = {
			descr: "Battery voltage",
			unit: "V",
			role: "value.voltage",
			type: "number",
			value: 0,
		} as any;
		const next = buildStateObject("dc_info.ubat", entry);
		expect(objectDefinitionChanged(next, next)).to.equal(false);

		const changed = buildStateObject("dc_info.ubat", { ...entry, descr: "Neue Beschreibung" });
		expect(objectDefinitionChanged(next, changed)).to.equal(true);

		const withUnit = buildStateObject("dc_info.ubat", { ...entry, unit: "mV" });
		expect(objectDefinitionChanged(next, withUnit)).to.equal(true);
	});

	it("ignores user customisation such as history configuration", () => {
		const entry = { descr: "x", unit: "", role: "state", type: "number", value: 0 } as any;
		const next = buildStateObject("dc_info.ubat", entry);
		const existing = {
			...next,
			common: { ...next.common, custom: { "influxdb.0": { enabled: true } } },
		};
		expect(objectDefinitionChanged(existing, next)).to.equal(false);
	});
});
