import { expect } from "chai";
import { Mk2Protocol } from "./mk2Protocol";
import { formatDeviceVersion, makeRamInfo, ramDisplayValue, ramScale } from "./mk2Ram";
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

describe("RAM metadata helpers (protocol §7.3.9)", () => {
	it("applies the RAM scale rule", () => {
		expect(ramScale(0x7f9c)).to.be.closeTo(0.01, 1e-9);
		expect(ramScale(0x7f38)).to.be.closeTo(0.005, 1e-9);
		expect(ramScale(-1)).to.equal(1);
		expect(ramScale(2)).to.equal(2);
	});

	it("keeps signedness and offsets separate", () => {
		const info = makeRamInfo(14, -1, 0);
		expect(info.signed).to.equal(true);
		expect(ramDisplayValue(info, 65236)).to.equal(-300);
		expect(ramDisplayValue(info, 250)).to.equal(250);
	});

	it("decodes bit fields (offset 0x8000, Sc = bit + 1)", () => {
		const info = makeRamInfo(12, 6, 0x8000);
		expect(info.isBit).to.equal(true);
		expect(ramDisplayValue(info, 0b100000)).to.equal(1);
		expect(ramDisplayValue(info, 0)).to.equal(0);
	});

	it("marks Sc = 0 as unsupported", () => {
		expect(makeRamInfo(9, 0, 0).supported).to.equal(false);
	});

	it("formats the device version as AA BB CCC", () => {
		expect(formatDeviceVersion(2612431)).to.equal("26 12 431");
	});
});

describe("Mk2Protocol RAM telemetry (issue #6)", () => {
	it("reads filtered power and internal SOC with their scalings", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.readRamTelemetry();
		expect(p.mk2Model["power.inverter"].value).to.equal(250);
		expect(p.mk2Model["power.output"].value).to.equal(-300);
		expect(p.mk2Model["battery.soc"].value).to.equal(80);
	});

	it("caches the RAM info per id", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.readRamVar(14);
		const infoRequests = fake.requests.filter((r) => r[3] == 0x36 && r[4] == 14).length;
		expect(infoRequests).to.equal(1);
		await p.readRamVar(14);
		expect(fake.requests.filter((r) => r[3] == 0x36 && r[4] == 14).length).to.equal(1);
	});

	it("does not poll unsupported variables again", async () => {
		const fake = new FakeMk2Connection();
		fake.unsupportedRam.add(13);
		const p = protocolWith(fake);
		expect(await p.readRamVar(13)).to.equal(null);
		const requests = fake.requests.filter((r) => r[3] == 0x30).length;
		expect(requests).to.equal(1);
		expect(await p.readRamVar(13)).to.equal(null);
		expect(fake.requests.filter((r) => r[3] == 0x30).length).to.equal(1);
	});

	it("a full poll contains power and SOC states", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["power.output"].value).to.equal(-300);
		expect(p.mk2Model["battery.soc"].value).to.equal(80);
	});

	it("detects bit fields through the real parser, not only in the helper (issue #24)", async () => {
		const fake = new FakeMk2Connection();
		// relay state: bit field, Sc = 6 -> bit 5, offset sentinel 0x8000
		fake.ramInfoOverrides.set(12, { sc: 6, offset: 0x8000 });
		fake.ramValues.set(12, 0b100000);
		const p = protocolWith(fake);
		expect(await p.readRamVar(12)).to.equal(1);
		fake.ramValues.set(12, 0);
		expect(await p.readRamVar(12)).to.equal(0);
	});
});

describe("Mk2Protocol device identification (issue #3)", () => {
	it("reads the MultiPlus firmware from both version parts", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.loadDeviceInfo();
		expect(p.mk2Model["info.device_sw_version"].value).to.equal(2612431);
		expect(p.mk2Model["info.device_sw_version_text"].value).to.equal("26 12 431");
		expect(p.mk2Model["info.mk2_version"].value).to.equal(1130128);
		expect(p.mk2Model["info.mk2_mode"].value).to.equal(0);
	});

	it("reads the device info only once per connection", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.loadDeviceInfo();
		const requests = fake.requests.length;
		await p.loadDeviceInfo();
		expect(fake.requests.length).to.equal(requests);
	});

	it("stores the VE.Bus address from the address response", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.address();
		expect(p.mk2Model["info.address"].value).to.equal(0);
	});

	it("loads each scaling only once per connection", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.loadScalingsIfNeeded();
		const count = fake.requests.filter((r) => r[3] == 0x36).length;
		expect(count).to.equal(8);
		await p.loadScalingsIfNeeded();
		expect(fake.requests.filter((r) => r[3] == 0x36).length).to.equal(count);
	});

	it("resets cached metadata after a resync (issue #25)", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.poll();
		const infoReads = fake.requests.filter((r) => r[3] == 0x35).length;
		expect(infoReads).to.be.greaterThan(0);
		const isVersionRead = (r: Buffer) => r[2] == 0x57 && r[3] == 0x05;
		expect(fake.requests.filter(isVersionRead).length).to.equal(1);

		fake.generation = 2; // a new sync generation means a new connection/device
		await p.poll();
		expect(fake.requests.filter((r) => r[3] == 0x35).length).to.be.greaterThan(infoReads);
		expect(fake.requests.filter(isVersionRead).length).to.equal(2);
	});
});
