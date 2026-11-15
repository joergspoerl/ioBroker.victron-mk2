import { expect } from "chai";
import { isStableState } from "./state-gate";

describe("state gate", () => {
	it("rejects down/startup/off", () => {
		expect(isStableState(0)).to.equal(false);
		expect(isStableState(10)).to.equal(false);
		expect(isStableState(20)).to.equal(false);
	});

	it("accepts bypass/charge/invert/assist", () => {
		expect(isStableState(80)).to.equal(true);
		expect(isStableState(90)).to.equal(true);
		expect(isStableState(40)).to.equal(true);
		expect(isStableState(70)).to.equal(true);
	});

	it("rejects non-numeric or non-finite states", () => {
		expect(isStableState(undefined)).to.equal(false);
		expect(isStableState(null)).to.equal(false);
		expect(isStableState(NaN)).to.equal(false);
		expect(isStableState("80")).to.equal(false);
	});
});
