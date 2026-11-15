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

	it("tolerates a longer F5 frame (protocol §3.2)", async () => {
		const f5 = veBusFrame(0x41, [
			0x10, 0x00, 0x00, 0x00, 0x04,
			0x1f, 0x00, 0xa0, 0x00,
			0x64, 0x00, 0x30, 0x00, // extra byte at the end
		], 0x0e);
		const fake = new FakeMk2Serial((request) => {
			if (request[2] == 0x46 && request[3] == 0x05) return f5;
			return mk2Frame(0x41, [0x01, 0x00]);
		});
		fake.push(versionFrame());
		const conn = new Mk2Connection("fake", log as any, fake as any);
		const p = new Mk2Protocol("fake", log as any, conn);
		await p.master_multi_led_info();
		expect(p.mk2Model["assist.limit"].value).to.equal(10);
	});
});
