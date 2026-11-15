import { expect } from "chai";
import { Mk2Protocol } from "./mk2Protocol";
import { asConnection, FakeMk2Connection } from "../test-utils/fake-mk2";
import { Mk2ValidationError } from "../lib/errors";

function makeLog() {
	const warnings: string[] = [];
	return {
		warnings,
		logger: {
			level: "info",
			debug: () => undefined,
			info: () => undefined,
			warn: (msg: string) => warnings.push(msg),
			error: () => undefined,
		} as any,
	};
}

function protocolWith(fake: FakeMk2Connection, logger?: any): Mk2Protocol {
	return new Mk2Protocol("fake", logger ?? makeLog().logger, asConnection(fake));
}

describe("set_assist range safety (issue #11)", () => {
	it("rejects values that would wrap around to 0 A", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await expect(p.set_assist(6553.6)).to.be.rejectedWith(Mk2ValidationError);
		await expect(p.set_assist(1e308)).to.be.rejectedWith(Mk2ValidationError);
		expect(fake.requests.filter((r) => r[2] == 0x53).length).to.equal(0);
	});

	it("accepts the protocol maximum and rejects one step above", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_assist(3276.7);
		expect(fake.limit).to.be.closeTo(3276.7, 0.01);
		await expect(p.set_assist(3276.8)).to.be.rejectedWith(Mk2ValidationError);
	});
});

describe("additional flag controls (issue #10)", () => {
	it("writes DisableAES (Flags0 bit 8) with readback", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_flagDisableAES(0);
		expect(fake.flags0 & (1 << 8)).to.equal(0);
		await p.set_flagDisableAES(1);
		expect(fake.flags0 & (1 << 8)).to.be.greaterThan(0);
		expect(fake.writes.map((w) => w.id)).to.deep.equal([0, 0]);
	});

	it("writes AssistEnabled (Flags0 bit 5)", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_flagAssistEnabled(0);
		expect(fake.flags0 & (1 << 5)).to.equal(0);
	});

	it("writes DynamicCurrentLimiter through Flags1 bit 12", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_flagDynamicCurrentLimiter(1);
		expect(fake.flags1 & (1 << 12)).to.be.greaterThan(0);
		expect(fake.writes.map((w) => w.id)).to.deep.equal([1]);
		await p.set_flagDynamicCurrentLimiter(0);
		expect(fake.flags1 & (1 << 12)).to.equal(0);
	});

	it("rejects values other than 0/1 without writing", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await expect(p.set_flagDisableAES(2)).to.be.rejectedWith(Mk2ValidationError);
		await expect(p.set_flagDynamicCurrentLimiter(5)).to.be.rejectedWith(Mk2ValidationError);
		expect(fake.writes.length).to.equal(0);
	});

	it("rejects flags the device support mask does not advertise", async () => {
		const fake = new FakeMk2Connection();
		fake.settingInfoOverrides.set(0, { sc: 1, offset: 0, def: 0, min: 0, max: 1 << 6 });
		const p = protocolWith(fake);
		await expect(p.set_flagDisableAES(1)).to.be.rejectedWith("not supported");
		expect(fake.writes.length).to.equal(0);
	});

	it("rejects Flags1 writes when the mask lacks bit 12", async () => {
		const fake = new FakeMk2Connection();
		fake.settingInfoOverrides.set(1, { sc: 1, offset: 0, def: 0, min: 0, max: 0 });
		const p = protocolWith(fake);
		await expect(p.set_flagDynamicCurrentLimiter(1)).to.be.rejectedWith("not supported");
	});

	it("never read-modify-writes Flags1 from an unreadable register (issue #21)", async () => {
		const fake = new FakeMk2Connection();
		fake.unreadableSettings.add(1);
		const p = protocolWith(fake);
		await expect(p.set_flagDynamicCurrentLimiter(1)).to.be.rejectedWith("could not be read");
		expect(fake.writes.length).to.equal(0);
	});
});

describe("scaled setting writes (issue #10)", () => {
	it("converts the absorption voltage to raw and refreshes the read-only state", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_UBatAbsorption(14.3);
		expect(fake.writes).to.deep.equal([{ id: 2, value: 1430 }]);
		expect(p.mk2Model["setting.UBatAbsorption"].value).to.be.closeTo(14.3, 1e-9);
	});

	it("writes the float voltage", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_UBatFloat(13.6);
		expect(fake.writes).to.deep.equal([{ id: 3, value: 1360 }]);
		expect(p.mk2Model["setting.UBatFloat"].value).to.be.closeTo(13.6, 1e-9);
	});

	it("writes the AC1 input current limit with its 0.1 scaling", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_IMainsLimitAC1(10);
		expect(fake.writes).to.deep.equal([{ id: 6, value: 100 }]);
		expect(p.mk2Model["setting.IMainsLimitAC1"].value).to.equal(10);
	});

	it("rejects values outside the device range", async () => {
		const fake = new FakeMk2Connection();
		fake.settingInfoOverrides.set(2, { sc: -100, offset: 0, def: 1440, min: 1200, max: 1600 });
		const p = protocolWith(fake);
		await expect(p.set_UBatAbsorption(20)).to.be.rejectedWith(Mk2ValidationError);
		await expect(p.set_UBatAbsorption(10)).to.be.rejectedWith(Mk2ValidationError);
		expect(fake.writes.length).to.equal(0);
	});

	it("rejects unsupported settings and non-finite values", async () => {
		const fake = new FakeMk2Connection();
		fake.unsupportedSettings.add(2);
		const p = protocolWith(fake);
		await expect(p.set_UBatAbsorption(14.2)).to.be.rejectedWith("not supported");
		await expect(p.set_UBatFloat(NaN)).to.be.rejectedWith("invalid value");
		expect(fake.writes.length).to.equal(0);
	});

	it("fails when the device does not apply the write", async () => {
		const fake = new FakeMk2Connection();
		fake.ignoreWrites = true;
		const p = protocolWith(fake);
		// A readback mismatch is an error, not a warning: the queue must be able
		// to retry or report it instead of pretending success (issue #17).
		await expect(p.set_UBatAbsorption(14.3)).to.be.rejectedWith("readback mismatch");
	});

	it("IBatBulk writes are read back as well", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_setting_IBatBulk(100);
		expect(fake.ibatBulk).to.equal(100);
		expect(p.mk2Model["setting.IBatBulk"].value).to.equal(100);
	});
});
