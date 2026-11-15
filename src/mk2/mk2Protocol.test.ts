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

describe("Mk2Protocol", () => {
	it("create_frame matches the protocol examples", () => {
		const p = protocolWith(new FakeMk2Connection());
		// Address example from MK2 protocol appendix 1
		expect(p.create_frame("A", "\x01\x00").toString("hex")).to.equal("04ff410100bb");
		// S variant 2 example: switch on, limit 31.5 A
		const setAssist = Buffer.from([0x03, 0x3B, 0x01, 0x01, 0x80]);
		expect(p.create_frame("S", setAssist).toString("hex")).to.equal("07ff53033b010180e7");
	});

	it("checksum accepts valid frames and rejects corrupt ones", () => {
		const p = protocolWith(new FakeMk2Connection());
		const frame = p.create_frame("A", "\x01\x00");
		expect(p.checksum(frame)).to.equal(true);
		const bad = Buffer.from(frame);
		bad[bad.length - 1] ^= 0xFF;
		expect(p.checksum(bad)).to.equal(false);
	});

	it("pollStateOnly only reads address and state", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.pollStateOnly();
		expect(fake.requests.map((r) => r[2])).to.deep.equal([0x41, 0x57]);
		expect(p.mk2Model["state.state"].value).to.equal(80);
	});

	it("poll populates the model with plausible values", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["state.state"].value).to.equal(80);
		expect(p.mk2Model["ac_info.umains"].value).to.equal(237);
		expect(p.mk2Model["ac_info.fmains"].value).to.equal(50);
		expect(p.mk2Model["dc_info.ubat"].value).to.be.closeTo(13.02, 0.01);
		expect(p.mk2Model["dc_info.ibat"].value).to.equal(0);
		expect(p.mk2Model["dc_info.icharge"].value).to.equal(0);
		expect(p.mk2Model["assist.minlimit"].value).to.equal(3.1);
		expect(p.mk2Model["assist.maxlimit"].value).to.equal(16);
		expect(p.mk2Model["assist.limit"].value).to.equal(16);
		expect(p.mk2Model["led.mains"].value).to.equal(1);
		expect(p.mk2Model["led.inverter"].value).to.equal(0);
		expect(p.mk2Model["setting.flag.DisableAES"].value).to.equal(true);
		expect(p.mk2Model["setting.flag.AssistEnabled"].value).to.equal(true);
		expect(p.mk2Model["setting.flag.DisableCharge"].value).to.equal(true);
		expect(p.mk2Model["setting.flag.EnableReducedFloat"].value).to.equal(true);
		expect(p.mk2Model["setting.flag.WeakACInput"].value).to.equal(false);
		expect(p.mk2Model["setting.IBatBulk"].value).to.equal(120);
	});
});
