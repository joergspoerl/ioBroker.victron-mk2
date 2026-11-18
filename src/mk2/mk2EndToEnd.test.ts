import { expect } from "chai";
import { Mk2Connection } from "./mk2Connection";
import { Mk2Protocol } from "./mk2Protocol";
import { FakeMk2Serial, mk2Frame, veBusFrame, versionFrame } from "../test-utils/fake-mk2";

const log = {
	level: "info",
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
};

/**
 * End-to-end through the real receiver: the fake connection classes used in the
 * other tests hand ready-made buffers to the decoders, which hides length and
 * checksum mismatches (that is how the switch-register bug survived).
 */
describe("end-to-end through the real Mk2Connection receiver", () => {
	it("parses a length-conformant MasterMultiLED frame (issue #38)", async () => {
		const f5 = veBusFrame(0x41, [
			0x10, 0x00, 0x00, 0x00, 0x04,
			0x1f, 0x00, 0xa0, 0x00, // min 3.1 A, max 16 A
			0x64, 0x00, // actual 10.0 A
			0x30, // switch register: charge + invert
		], 0x0d);
		const fake = new FakeMk2Serial((request) => {
			if (request[2] == 0x57 && request[3] == 0x36) return mk2Frame(0x57, [0x8e, 0x9c, 0x7f, 0x8f, 0, 0]);
			if (request[2] == 0x46 && request[3] == 0x05) return f5;
			return mk2Frame(0x41, [0x01, 0x00]);
		});
		fake.push(versionFrame());
		const conn = new Mk2Connection("fake", log as any, fake as any);
		const p = new Mk2Protocol("fake", log as any, conn);
		await p.master_multi_led_info();
		expect(p.mk2Model["assist.limit"].value).to.equal(10);
		expect(p.mk2Model["switch.state"].value).to.equal(3);
	});

	it("reads the switch register at the end of the extended F5 frame", async () => {
		// Real frame from firmware 1909209 while the MultiPlus was in Inverter only:
		// extra AC-input bytes sit between the limits and the switch register.
		const f5 = veBusFrame(0x41, [
			0x10, 0x10, 0x00, 0x00, 0x04,
			0x1f, 0x00, 0xa0, 0x00,
			0x1f, 0x00,
			0x00, 0x00, 0x67,
		], 0x0f);
		const fake = new FakeMk2Serial((request) => {
			if (request[2] == 0x57 && request[3] == 0x36) return mk2Frame(0x57, [0x8e, 0x9c, 0x7f, 0x8f, 0, 0]);
			if (request[2] == 0x46 && request[3] == 0x05) return f5;
			return mk2Frame(0x41, [0x01, 0x00]);
		});
		fake.push(versionFrame());
		const conn = new Mk2Connection("fake", log as any, fake as any);
		const p = new Mk2Protocol("fake", log as any, conn);
		await p.master_multi_led_info();
		expect(p.mk2Model["assist.limit"].value).to.equal(3.1);
		expect(p.mk2Model["switch.state"].value).to.equal(2);
		expect(p.mk2Model["switch.SwitchInvert"].value).to.equal(1);
		expect(p.mk2Model["switch.SwitchCharge"].value).to.equal(0);
	});

	it("masks the LED-append bit before parsing the extended F5 frame", async () => {
		const f5 = veBusFrame(0x41, [
			0x10, 0x10, 0x00, 0x00, 0x04,
			0x1f, 0x00, 0xa0, 0x00,
			0x1f, 0x00,
			0x00, 0x00, 0x67,
		], 0x8f); // length bit 7: an L block follows
		const fake = new FakeMk2Serial((request) => {
			if (request[2] == 0x57 && request[3] == 0x36) return mk2Frame(0x57, [0x8e, 0x9c, 0x7f, 0x8f, 0, 0]);
			if (request[2] == 0x46 && request[3] == 0x05) return Buffer.concat([f5, Buffer.from([0x4c, 0x10, 0x00])]);
			return mk2Frame(0x41, [0x01, 0x00]);
		});
		fake.push(versionFrame());
		const conn = new Mk2Connection("fake", log as any, fake as any);
		const p = new Mk2Protocol("fake", log as any, conn);
		await p.master_multi_led_info();
		expect(p.mk2Model["assist.limit"].value).to.equal(3.1);
		expect(p.mk2Model["switch.state"].value).to.equal(2);
	});

	it("keeps the previous switch state when both candidates are plausible", async () => {
		const normal = veBusFrame(0x41, [
			0x10, 0x10, 0x00, 0x00, 0x04,
			0x1f, 0x00, 0xa0, 0x00,
			0x1f, 0x00,
			0x30, 0x00,
		], 0x0e);
		// Same length, but response[13] = 0x10 (Charger only) and the last data
		// byte = 0x30 (On). Both are plausible for state 80.
		const ambiguous = veBusFrame(0x41, [
			0x10, 0x10, 0x00, 0x00, 0x04,
			0x1f, 0x00, 0xa0, 0x00,
			0x1f, 0x00,
			0x10, 0x00, 0x30,
		], 0x0f);
		let f5 = normal;
		const fake = new FakeMk2Serial((request) => {
			if (request[2] == 0x57 && request[3] == 0x0e) return mk2Frame(0x57, [0x94, 8, 0]);
			if (request[2] == 0x57 && request[3] == 0x36) return mk2Frame(0x57, [0x8e, 0x9c, 0x7f, 0x8f, 0, 0]);
			if (request[2] == 0x46 && request[3] == 0x05) return f5;
			return mk2Frame(0x41, [0x01, 0x00]);
		});
		fake.push(versionFrame());
		const p = new Mk2Protocol("fake", log as any, new Mk2Connection("fake", log as any, fake as any));
		await p.get_state();
		await p.master_multi_led_info();
		expect(p.mk2Model["switch.state"].value).to.equal(3);
		f5 = ambiguous;
		await p.master_multi_led_info();
		expect(p.mk2Model["switch.state"].value).to.equal(3);
		expect(p.currentSwitchState).to.equal(3);
	});

	it("tolerates a longer F5 frame (protocol §3.2)", async () => {		const f5 = veBusFrame(0x41, [
			0x10, 0x00, 0x00, 0x00, 0x04,
			0x1f, 0x00, 0xa0, 0x00,
			0x64, 0x00, 0x30, 0x00, // extra byte at the end
		], 0x0e);
		const fake = new FakeMk2Serial((request) => {
			if (request[2] == 0x57 && request[3] == 0x36) return mk2Frame(0x57, [0x8e, 0x9c, 0x7f, 0x8f, 0, 0]);
			if (request[2] == 0x46 && request[3] == 0x05) return f5;
			return mk2Frame(0x41, [0x01, 0x00]);
		});
		fake.push(versionFrame());
		const conn = new Mk2Connection("fake", log as any, fake as any);
		const p = new Mk2Protocol("fake", log as any, conn);
		await p.master_multi_led_info();
		expect(p.mk2Model["assist.limit"].value).to.equal(10);
		expect(p.mk2Model["switch.state"].value).to.equal(3);
	});
});

describe("longer responses are tolerated (issue #42)", () => {
	function protocolFor(fake: FakeMk2Serial): Mk2Protocol {
		return new Mk2Protocol("fake", log as any, new Mk2Connection("fake", log as any, fake as any));
	}

	it("DC info with an extra trailing byte", async () => {
		const dc = veBusFrame(0x20, [
			0x00, 0x9a, 0x22, 0x46, 0x0c, 0x16, 0x05,
			0, 0, 0, 0, 0, 0, 20, 0x00,
		], 0x10);
		const fake = new FakeMk2Serial((request) => {
			if (request[2] == 0x57 && request[3] == 0x36) return mk2Frame(0x57, [0x8e, 0x9c, 0x7f, 0x8f, 0, 0]);
			if (request[2] == 0x46 && request[3] == 0x00) return dc;
			return mk2Frame(0x41, [0x01, 0x00]);
		});
		fake.push(versionFrame());
		const p = protocolFor(fake);
		await p.loadScalingsIfNeeded();
		await p.dc_info();
		expect(p.mk2Model["dc_info.ubat"].value).to.be.closeTo(13.02, 0.01);
		expect(p.mk2Model["dc_info.finv"].value).to.equal(50);
	});

	it("AC info with an extra trailing byte", async () => {
		const ac = veBusFrame(0x20, [
			0x01, 0x01, 0x22, 0x46, 0x08, 0xaf, 0x5c,
			0, 0, 0, 0, 0, 0, 0xc3, 0x00,
		], 0x10);
		const fake = new FakeMk2Serial((request) => {
			if (request[2] == 0x57 && request[3] == 0x36 && request[4] == 8) {
				// mains period scaling: offset 205, scale 0.0005 (50 Hz at raw 195)
				return mk2Frame(0x57, [0x8e, 0x30, 0x78, 0x8f, 205, 0]);
			}
			if (request[2] == 0x57 && request[3] == 0x36) return mk2Frame(0x57, [0x8e, 0x9c, 0x7f, 0x8f, 0, 0]);
			if (request[2] == 0x46 && request[3] == 0x01) return ac;
			return mk2Frame(0x41, [0x01, 0x00]);
		});
		fake.push(versionFrame());
		const p = protocolFor(fake);
		await p.loadScalingsIfNeeded();
		await p.ac_info();
		expect(p.mk2Model["ac_info.umains"].value).to.equal(237);
		expect(p.mk2Model["ac_info.fmains"].value).to.equal(50);
	});

	it("state response with an extra byte", async () => {
		const response = mk2Frame(0x57, [0x94, 8, 0, 0x00]);
		const fake = new FakeMk2Serial((request) => {
			if (request[2] == 0x57) return response;
			return mk2Frame(0x41, [0x01, 0x00]);
		});
		fake.push(versionFrame());
		const p = protocolFor(fake);
		await p.get_state();
		expect(p.mk2Model["state.state"].value).to.equal(80);
	});
});
