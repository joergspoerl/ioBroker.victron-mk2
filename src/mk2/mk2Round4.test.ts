import { expect } from "chai";
import { Mk2Protocol } from "./mk2Protocol";
import { asConnection, FakeMk2Connection } from "../test-utils/fake-mk2";
import { settingDisplayValue, SettingInfo } from "./mk2Settings";

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

describe("round 4 protocol findings", () => {
	it("reads the RAM offset from the long Winmon form (§7.3.9 mode 2)", async () => {
		const fake = new FakeMk2Connection();
		fake.longRamInfo = true;
		const p = protocolWith(fake);
		await p.fmains_calc_load();
		expect(p.calc.fmains_calc?.offset).to.equal(205);
		expect(p.calc.fmains_calc?.scale).to.equal(0x7830);
	});

	it("publishes 0 Hz instead of Infinity when the mains period is 0", async () => {
		const fake = new FakeMk2Connection();
		fake.acPeriod = 0;
		const p = protocolWith(fake);
		await p.loadScalingsIfNeeded();
		await p.ac_info();
		expect(p.mk2Model["ac_info.fmains"].value).to.equal(0);
	});

	it("accepts the phase values 5-7 (L4/L3/L2)", async () => {
		const fake = new FakeMk2Connection();
		fake.acPhase = 0x05;
		const p = protocolWith(fake);
		await p.ac_info();
		expect(p.mk2Model["ac_info.phase_info"].value).to.equal(5);
	});

	it("applies the 0x8000 bias to setting 63", () => {
		const info: SettingInfo = {
			id: 63, supported: true, sc: 1, scale: 1, offset: 0, def: null, min: null, max: null,
		};
		expect(settingDisplayValue(info, 0x8000)).to.equal(0);
		expect(settingDisplayValue(info, 0x8003)).to.equal(3);
	});

	it("rejects a 0 A write that leaves no visible trace", async () => {
		const fake = new FakeMk2Connection();
		fake.ignoreAssistWrites = true;
		const p = protocolWith(fake);
		p.mk2Model["setting.flag.AssistEnabled"].value = true;
		await p.master_multi_led_info();
		await expect(p.set_assist(0)).to.be.rejectedWith("0 A was not applied");
	});

	it("acknowledges the quantized 0.1 A value the device holds", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.master_multi_led_info();
		expect(await p.set_assist(4.04)).to.equal(4);
	});

	it("acknowledges the quantized setting value, not the raw request", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		// IMainsLimitAC1 has 0.1 A scaling: 15.04 -> raw 150 -> 15.0 A.
		expect(await p.set_IMainsLimitAC1(15.04)).to.equal(15);
	});
});
