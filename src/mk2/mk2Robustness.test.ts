import { expect } from "chai";
import { Mk2Protocol } from "./mk2Protocol";
import { switchStateFromRegister } from "./mk2Switch";
import { asConnection, FakeMk2Connection } from "../test-utils/fake-mk2";

function makeLog() {
	const infos: string[] = [];
	return {
		infos,
		logger: {
			level: "info",
			debug: () => undefined,
			info: (msg: string) => infos.push(msg),
			warn: () => undefined,
			error: () => undefined,
		} as any,
	};
}

function protocolWith(fake: FakeMk2Connection, logger?: any): Mk2Protocol {
	return new Mk2Protocol("fake", logger ?? makeLog().logger, asConnection(fake));
}

describe("switch state derivation (issue #7)", () => {
	it("maps the switch register bits to the panel state", () => {
		expect(switchStateFromRegister(0b00110000)).to.equal(3); // On
		expect(switchStateFromRegister(0b00010000)).to.equal(1); // Charger only
		expect(switchStateFromRegister(0b00100000)).to.equal(2); // Inverter only
		expect(switchStateFromRegister(0)).to.equal(4); // Off
	});

	it("adopts the device switch state and exposes it as switch.state", async () => {
		const fake = new FakeMk2Connection();
		fake.switchRegister = 0b00010000; // charger only
		const p = protocolWith(fake);
		await p.master_multi_led_info();
		expect(p.currentSwitchState).to.equal(1);
		expect(p.mk2Model["switch.state"].value).to.equal(1);
		await p.set_assist(5);
		expect(fake.switchState).to.equal(1);
	});

	it("logs when the device switch state differs from the local assumption", async () => {
		const fake = new FakeMk2Connection();
		fake.switchRegister = 0b00100000; // inverter only
		const log = makeLog();
		const p = protocolWith(fake, log.logger);
		await p.master_multi_led_info();
		expect(log.infos.some((m) => m.includes("switch state changed"))).to.equal(true);
	});

	it("refuses to switch a device on implicitly when it is Off", async () => {
		const fake = new FakeMk2Connection();
		fake.switchRegister = 0;
		const p = protocolWith(fake);
		await p.master_multi_led_info();
		expect(p.currentSwitchState).to.equal(4);
		await expect(p.set_assist(5)).to.be.rejectedWith("Off");
		expect(fake.switchState).to.equal(3); // nothing was written
	});

	it("does not derive a switch state when the frame has no register (issue #38)", async () => {
		const fake = new FakeMk2Connection();
		fake.masterMultiLedHasRegister = false;
		const p = protocolWith(fake);
		await p.set_switch_state(2);
		await p.master_multi_led_info();
		expect(p.currentSwitchState).to.equal(2); // unchanged, not from the checksum
		expect(p.mk2Model["switch.state"].value).to.equal(null);
		expect(p.mk2Model["switch.SwitchInvert"].value).to.equal(null);
	});

	it("uses the register when it is present", async () => {
		const fake = new FakeMk2Connection();
		fake.switchRegister = 0b00010000;
		const p = protocolWith(fake);
		await p.master_multi_led_info();
		expect(p.mk2Model["switch.state"].value).to.equal(1);
	});
});

describe("connection diagnostics (issue #8)", () => {
	it("marks the connection as established after a successful poll", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["info.connection"].value).to.equal(true);
	});

	it("marks the connection as lost when the poll fails", async () => {
		const fake = new FakeMk2Connection();
		fake.failNext = "02ff4cb3"; // the L (LED status) request
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["info.connection"].value).to.equal(false);
	});

	it("mirrors the connection error counters into the model", async () => {
		const fake = new FakeMk2Connection();
		fake.timeouts = 3;
		fake.checksumErrors = 1;
		fake.lastError = "MK2 frame checksum error";
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["diag.timeouts"].value).to.equal(3);
		expect(p.mk2Model["diag.checksum_errors"].value).to.equal(1);
		expect(p.mk2Model["diag.last_error"].value).to.equal("MK2 frame checksum error");
	});

	it("propagates a transport failure inside an optional block (issue #16)", async () => {
		const fake = new FakeMk2Connection();
		// the RAM info request for the internal SOC fails at the transport level
		fake.failNext = "05ff57360d0062";
		const p = protocolWith(fake);
		await p.poll();
		expect(p.mk2Model["info.connection"].value).to.equal(false);
	});
});
