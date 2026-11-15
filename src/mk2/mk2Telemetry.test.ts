import { expect } from "chai";
import { Mk2Protocol } from "./mk2Protocol";
import { asConnection, FakeMk2Connection } from "../test-utils/fake-mk2";

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

describe("Mk2Protocol battery current scaling (issue #1)", () => {
	it("requests the scaling of RAM ID 5 (IBat), not ID 6 (UBatRMS)", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.ibat_calc_load();
		const request = fake.requests[0];
		expect(request[3]).to.equal(0x36);
		expect(request[4]).to.equal(0x05);
		expect(request[5]).to.equal(0x00);
	});

	it("handles the signed IBat scaling from protocol appendix 2", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.loadScalingsIfNeeded();
		// -32668 -> 1 / (0x8000 - 32668) = 0.01
		expect(p.calc.ibat_calc?.scale).to.equal(-32668);
	});
});

describe("Mk2Protocol DC telemetry (issue #5)", () => {
	it("exposes inverter current, charge current and the net battery current", async () => {
		const fake = new FakeMk2Connection();
		fake.dcInverterCurrent = 200; // 2.00 A
		fake.dcChargeCurrent = 500; // 5.00 A
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["dc_info.ibat"].value).to.equal(2);
		expect(p.mk2Model["dc_info.icharge"].value).to.equal(5);
		expect(p.mk2Model["dc_info.ibat_net"].value).to.equal(3);
	});

	it("reports a discharging battery as a negative net current", async () => {
		const fake = new FakeMk2Connection();
		fake.dcInverterCurrent = 700;
		fake.dcChargeCurrent = 100;
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["dc_info.ibat_net"].value).to.equal(-6);
	});

	it("decodes the inverter period into a frequency", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["dc_info.finv"].value).to.equal(50);
	});

	it("reports 0 Hz when the inverter period is 0 instead of dividing by zero", async () => {
		const fake = new FakeMk2Connection();
		fake.inverterPeriod = 0;
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["dc_info.finv"].value).to.equal(0);
	});
});

describe("Mk2Protocol state and sub-state (issue #9)", () => {
	it("splits the 0x94 response into encoded state and sub-state", async () => {
		const fake = new FakeMk2Connection();
		fake.currentState = 9;
		fake.currentSubState = 2;
		const p = protocolWith(fake);
		await p.get_state();
		expect(p.mk2Model["state.state"].value).to.equal(92);
		expect(p.mk2Model["state.substate"].value).to.equal(2);
	});

	it("decodes the force_state response into the model", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.force_state(3);
		expect(p.mk2Model["state.state"].value).to.equal(93);
		expect(p.mk2Model["state.substate"].value).to.equal(3);
	});

	it("rejects invalid force_state values instead of sending nothing", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await expect(p.force_state(0)).to.be.rejectedWith("invalid");
		await expect(p.force_state(4)).to.be.rejectedWith("invalid");
		expect(fake.requests.length).to.equal(0);
	});
});

describe("Mk2Protocol wave check flags (issue #9)", () => {
	it("exposes Flags0 bit 3 and bit 7", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.get_flags();
		expect(p.mk2Model["setting.flag.DisableWaveCheck"].value).to.equal(false);
		expect(p.mk2Model["setting.flag.WaveCheckInverted"].value).to.equal(true);
	});

	it("warns when bit 3 and bit 7 are not inverted", async () => {
		const fake = new FakeMk2Connection();
		const log = makeLog();
		const p = protocolWith(fake, log.logger);
		await p.get_flags();
		expect(log.warnings.length).to.equal(0);

		// bit 3 = 0 and bit 7 = 0 violates the required inversion
		fake.flags0 = (1 << 5) | (1 << 8);
		await p.get_flags();
		expect(log.warnings.length).to.equal(1);
		expect(log.warnings[0]).to.contain("wave check");
	});
});
