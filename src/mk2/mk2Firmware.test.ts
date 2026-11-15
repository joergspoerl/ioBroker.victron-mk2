import { expect } from "chai";
import { Mk2Protocol } from "./mk2Protocol";
import { asConnection, FakeMk2Connection } from "../test-utils/fake-mk2";

const log = {
	level: "info",
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
};

function protocolWith(fake: FakeMk2Connection): Mk2Protocol {
	return new Mk2Protocol("fake", log as any, asConnection(fake));
}

describe("firmware-dependent behaviour (live findings 2026-11-15)", () => {
	it("accepts the short Sc=0 response for unsupported RAM variables", async () => {
		const fake = new FakeMk2Connection();
		fake.ramInfoOverrides.set(14, { sc: 0, offset: 0 });
		const p = protocolWith(fake);
		expect(await p.readRamVar(14)).to.equal(null);
		const before = fake.requests.length;
		expect(await p.readRamVar(14)).to.equal(null);
		expect(fake.requests.length).to.equal(before);
	});

	it("an unsupported RAM variable does not abort the rest of the poll", async () => {
		const fake = new FakeMk2Connection();
		fake.ramInfoOverrides.set(14, { sc: 0, offset: 0 });
		fake.ramInfoOverrides.set(16, { sc: 0, offset: 0 });
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["power.inverter"].value).to.equal(null);
		expect(p.mk2Model["power.output"].value).to.equal(null);
		expect(p.mk2Model["battery.soc"].value).to.equal(80);
		expect(p.mk2Model["info.connection"].value).to.equal(true);
		// the extended settings run after the RAM block and must still arrive
		expect(p.mk2Model["setting.UBatAbsorption"].value).to.be.closeTo(14.2, 1e-9);
	});

	it("publishes the raw AC state only when the firmware has the field", async () => {
		const fake = new FakeMk2Connection();
		fake.deviceSwVersion = 1909140; // revision 140 < 207
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["ac_info.state"].value).to.equal(null);
	});

	it("keeps the raw AC state on firmware >= 207", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["ac_info.state"].value).to.equal(70);
	});
});
