import { expect } from "chai";
import { Mk2Protocol } from "./mk2Protocol";
import {
	settingScale,
	settingDisplayValue,
	settingRawValue,
	SettingInfoCollector,
	flags1Bit,
} from "./mk2Settings";
import { asConnection, FakeMk2Connection, mk2Frame, winmonFrames } from "../test-utils/fake-mk2";

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

describe("setting scaling rules (protocol §7.3.8)", () => {
	it("uses Sc directly when positive and 1/-Sc when negative", () => {
		expect(settingScale(2)).to.equal(2);
		expect(settingScale(-100)).to.equal(0.01);
		expect(settingScale(-10)).to.equal(0.1);
		expect(settingScale(0)).to.equal(1);
	});

	it("converts between raw and display values with offset", () => {
		const info = { scale: 0.01, offset: 5 } as any;
		expect(settingDisplayValue(info, 1420)).to.be.closeTo(14.25, 1e-9);
		expect(settingRawValue(info, 14.25)).to.equal(1420);
	});

	it("maps global flag numbers to Flags1 bits", () => {
		expect(flags1Bit(27)).to.equal(11);
		expect(flags1Bit(31)).to.equal(15);
	});
});

describe("SettingInfoCollector", () => {
	it("collects five W frames packed three plus two", async () => {
		const collector = new SettingInfoCollector(4);
		const frames = winmonFrames([
			[0x89, 0x01, 0x00],
			[0x8a, 0x00, 0x00],
			[0x8b, 0x78, 0x00],
			[0x8c, 0x00, 0x00],
			[0x8d, 0x78, 0x00],
		]);
		expect(frames.length).to.equal(2);
		expect(await collector.addFrame(frames[0])).to.equal(false);
		expect(await collector.addFrame(frames[1])).to.equal(true);
		expect(collector.info.supported).to.equal(true);
		expect(collector.info.scale).to.equal(1);
		expect(collector.info.def).to.equal(120);
		expect(collector.info.max).to.equal(120);
	});

	it("is complete after Sc = 0 (setting not supported)", async () => {
		const collector = new SettingInfoCollector(9);
		const done = await collector.addFrame(mk2Frame(0x57, [0x89, 0x00, 0x00]));
		expect(done).to.equal(true);
		expect(collector.info.supported).to.equal(false);
	});

	it("rejects non-Winmon frames", async () => {
		const collector = new SettingInfoCollector(4);
		expect(() => collector.addFrame(mk2Frame(0x41, [0x01, 0x00]))).to.throw("Winmon");
	});
});

describe("Mk2Protocol setting metadata (issue #2)", () => {
	it("reads and caches setting info", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		const info = await p.getSettingInfo(4);
		expect(info.supported).to.equal(true);
		expect(info.max).to.equal(120);
		const requestsAfterFirst = fake.requests.length;
		await p.getSettingInfo(4);
		expect(fake.requests.length).to.equal(requestsAfterFirst);
	});

	it("marks unsupported settings instead of throwing", async () => {
		const fake = new FakeMk2Connection();
		fake.unsupportedSettings.add(63);
		const p = protocolWith(fake);
		const info = await p.getSettingInfo(63);
		expect(info.supported).to.equal(false);
	});

	it("readSetting returns null for unsupported settings", async () => {
		const fake = new FakeMk2Connection();
		fake.unsupportedSettings.add(11);
		const p = protocolWith(fake);
		expect(await p.readSetting(11)).to.equal(null);
	});

	it("set_setting_IBatBulk honours the device maximum from GetSettingInfo", async () => {
		const fake = new FakeMk2Connection();
		fake.settingInfoOverrides.set(4, { sc: 1, offset: 0, def: 100, min: 0, max: 100 });
		const p = protocolWith(fake);
		await expect(p.set_setting_IBatBulk(101)).to.be.rejectedWith("between 0 and 100");
		await p.set_setting_IBatBulk(100);
		expect(fake.requests.some((r) => r.includes(0x34))).to.equal(true);
	});

	it("rejects a flag write when the device support mask lacks the bit", async () => {
		const fake = new FakeMk2Connection();
		// Flags0 support mask: only bit 6 (DisableCharge), not bit 14 (WeakACInput)
		fake.settingInfoOverrides.set(0, { sc: 1, offset: 0, def: 0, min: 0, max: 1 << 6 });
		const p = protocolWith(fake);
		await p.set_flagDisableCharge(1);
		await expect(p.set_flagWeakACInput(1)).to.be.rejectedWith("not supported");
	});
});

describe("Mk2Protocol extended read-only settings (issue #4)", () => {
	it("exposes Flags1 bits", async () => {
		const fake = new FakeMk2Connection();
		fake.flags1 = (1 << 12) | (1 << 14); // DynamicCurrentLimiter + RemoteOverrulesAC1
		const p = protocolWith(fake);
		await p.get_flags1();
		expect(p.mk2Model["setting.flag.DynamicCurrentLimiter"].value).to.equal(true);
		expect(p.mk2Model["setting.flag.RemoteOverrulesAC1"].value).to.equal(true);
		expect(p.mk2Model["setting.flag.AcceptWideInputFrequency"].value).to.equal(false);
		expect(p.mk2Model["setting.flag.LowPowerShutdownAES"].value).to.equal(false);
	});

	it("loads and scales the extended settings once", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.loadExtendedSettings();
		expect(p.mk2Model["setting.UBatAbsorption"].value).to.be.closeTo(14.2, 1e-9);
		expect(p.mk2Model["setting.UBatFloat"].value).to.be.closeTo(13.4, 1e-9);
		const requests = fake.requests.length;
		await p.loadExtendedSettings();
		expect(fake.requests.length).to.equal(requests);
	});

	it("marks unsupported extended settings as null", async () => {
		const fake = new FakeMk2Connection();
		fake.unsupportedSettings.add(50);
		const p = protocolWith(fake);
		await p.loadExtendedSettings();
		expect(p.mk2Model["setting.AESLowCurrentLimit"].value).to.equal(null);
	});

	it("a full poll includes Flags1 and the extended settings", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["setting.UBatAbsorption"].value).to.be.closeTo(14.2, 1e-9);
		expect(p.mk2Model["setting.flag.DynamicCurrentLimiter"].value).to.equal(false);
	});
});
