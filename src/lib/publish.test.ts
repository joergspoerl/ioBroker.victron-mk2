import { expect } from "chai";
import { publishModel, selectStatesToPublish } from "./publish";
import { Mk2Model } from "../mk2/mk2Model";

describe("state publication selection (issue #14)", () => {
	it("publishes the state poll even while the device is not stable", () => {
		const model = new Mk2Model();
		model["state.state"].value = 10;
		model["state.substate"].value = 0;
		model["info.address"].value = 0;
		const selected = selectStatesToPublish(model, ["state.state", "state.substate", "info.address"]);
		expect(selected).to.have.members(["state.state", "state.substate", "info.address"]);
	});

	it("never publishes control states", () => {
		const model = new Mk2Model();
		const selected = selectStatesToPublish(model);
		expect(selected.some((k) => k.startsWith("control."))).to.equal(false);
	});

	it("skips unchanged values once they were published", () => {
		const model = new Mk2Model();
		model["dc_info.ubat"].valueOld = model["dc_info.ubat"].value;
		expect(selectStatesToPublish(model)).to.not.include("dc_info.ubat");
		model["dc_info.ubat"].value = 13.1;
		expect(selectStatesToPublish(model)).to.include("dc_info.ubat");
	});

	it("publishes only changes and remembers them (issue #18)", async () => {
		const model = new Mk2Model();
		const writes: string[] = [];
		const setState = async (key: string) => {
			writes.push(key);
		};
		await publishModel(model, setState);
		const afterFirst = writes.length;
		expect(afterFirst).to.be.greaterThan(0);
		await publishModel(model, setState);
		expect(writes.length).to.equal(afterFirst);

		model["dc_info.ubat"].value = 12.9;
		await publishModel(model, setState);
		expect(writes.length).to.equal(afterFirst + 1);
		expect(writes[writes.length - 1]).to.equal("dc_info.ubat");
	});

	it("does not mark a state as published when the write fails", async () => {
		const model = new Mk2Model();
		const entry = model["dc_info.ubat"];
		const setState = async () => {
			throw new Error("db down");
		};
		await expect(publishModel(model, setState, ["dc_info.ubat"])).to.be.rejectedWith("db down");
		expect(entry.valueOld).to.not.equal(entry.value);
	});
});
