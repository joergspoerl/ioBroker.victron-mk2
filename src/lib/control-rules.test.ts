import { expect } from "chai";
import { CONTROL_STATE_IDS, shouldHandleControlState } from "./control-rules";
import { Mk2Model } from "../mk2/mk2Model";

describe("control rules", () => {
	it("accepts unacknowledged numeric writes for known controls", () => {
		for (const id of [
			"control.set_assist",
			"control.force_state",
			"control.DisableCharge",
			"control.WeakACInput",
			"control.IBatBulk",
			"control.switch_state",
			"control.grid_mode",
		]) {
			expect(shouldHandleControlState(id, { ack: false, val: 1 } as any)).to.equal(true);
		}
	});

	it("rejects acknowledged states (prevents readback loops)", () => {
		expect(shouldHandleControlState("control.force_state", { ack: true, val: 3 } as any)).to.equal(false);
		expect(shouldHandleControlState("control.DisableCharge", { ack: true, val: 1 } as any)).to.equal(false);
	});

	it("rejects unknown controls and non-numeric values", () => {
		expect(shouldHandleControlState("control.unknown", { ack: false, val: 1 } as any)).to.equal(false);
		expect(shouldHandleControlState("control.set_assist", { ack: false, val: "10" } as any)).to.equal(false);
		expect(shouldHandleControlState("control.set_assist", null)).to.equal(false);
	});

	it("whitelists every control the model exposes (no drift)", () => {
		const model = new Mk2Model();
		const controls = Object.entries(model)
			.filter(([, entry]) => typeof entry.setFunc === "function")
			.map(([key]) => key);
		expect(controls.length).to.be.greaterThan(10);
		for (const id of controls) {
			expect(CONTROL_STATE_IDS.has(id), `${id} fehlt in CONTROL_STATE_IDS`).to.equal(true);
		}
	});
});
