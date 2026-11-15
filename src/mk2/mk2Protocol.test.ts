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

describe("Mk2Protocol control writes", () => {
	it("set_assist uses the current switch state and updates the limit", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_assist(10);
		expect(fake.switchState).to.equal(3);
		expect(fake.limit).to.equal(10);
	});

	it("set_assist preserves an explicitly selected switch state", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_switch_state(2);
		await p.set_assist(10);
		expect(fake.switchState).to.equal(2);
		expect(fake.limit).to.equal(10);
	});

	it("set_assist rejects invalid values", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await expect(p.set_assist(-1)).to.be.rejectedWith("invalid");
		await expect(p.set_assist(NaN)).to.be.rejectedWith("invalid");
	});

	it("set_assist clamps to the device maximum", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.poll();
		await p.set_assist(20);
		expect(fake.limit).to.equal(16);
	});

	it("set_switch_state rejects invalid states", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await expect(p.set_switch_state(0)).to.be.rejectedWith("invalid");
		await expect(p.set_switch_state(5)).to.be.rejectedWith("invalid");
	});

	it("set_grid_mode grid uses max limit and On", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_grid_mode(0);
		expect(fake.switchState).to.equal(3);
		expect(fake.limit).to.equal(16);
	});

	it("set_grid_mode zero_grid writes 0 A and keeps On", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_grid_mode(1);
		expect(fake.switchState).to.equal(3);
		expect(fake.limit).to.equal(0);
	});

	it("set_grid_mode inverter_only selects switch state 2", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_grid_mode(2);
		expect(fake.switchState).to.equal(2);
	});

	it("set_grid_mode rejects invalid modes", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await expect(p.set_grid_mode(3)).to.be.rejectedWith("invalid");
	});

	it("rejects zero grid when PowerAssist is disabled (issue #45)", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		p.mk2Model["setting.flag.AssistEnabled"].value = false;
		await expect(p.set_grid_mode(1)).to.be.rejectedWith("PowerAssist");
		expect(fake.requests.filter((r) => r[2] == 0x53).length).to.equal(0);
	});

	it("allows zero grid with PowerAssist enabled", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		p.mk2Model["setting.flag.AssistEnabled"].value = true;
		await p.set_grid_mode(1);
		expect(fake.limit).to.equal(0);
	});

	it("clamps up to the device minimum instead of acknowledging an impossible value (issue #49)", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.poll(); // minlimit = 3.1 A
		await p.set_assist(0.1);
		expect(fake.limit).to.be.closeTo(3.1, 0.001);
		await p.set_assist(0); // 0 A is the inverter mode, not clamped
		expect(fake.limit).to.equal(0);
	});

	it("set_setting_IBatBulk accepts a valid value", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_setting_IBatBulk(100);
		expect(fake.requests.some((r) => r.includes(0x34))).to.equal(true);
	});

	it("set_setting_IBatBulk rejects invalid values", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await expect(p.set_setting_IBatBulk(-1)).to.be.rejectedWith("between 0 and 120");
		await expect(p.set_setting_IBatBulk(121)).to.be.rejectedWith("between 0 and 120");
		await expect(p.set_setting_IBatBulk(1.5)).to.be.rejectedWith("must be an integer");
	});

	it("set_flagDisableCharge and set_flagWeakACInput accept 0/1", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.set_flagDisableCharge(1);
		await p.set_flagWeakACInput(0);
		expect(fake.requests.length).to.be.greaterThan(1);
	});

	it("force_state validates the 0x94 response", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.force_state(3);
		expect(fake.requests.some((r) => r[3] == 0x0E)).to.equal(true);
	});

	it("set_grid_mode grid uses the configured AC1 limit when available (issue #44)", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		p.mk2Model["setting.IMainsLimitAC1"].value = 10;
		await p.set_grid_mode(0);
		expect(fake.limit).to.equal(10);
	});

	it("set_grid_mode grid falls back to the device maximum without a configured limit", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		p.mk2Model["setting.IMainsLimitAC1"].value = null;
		await p.set_grid_mode(0);
		expect(fake.limit).to.equal(16);
	});
});

describe("Mk2Protocol protocol validation", () => {
	it("ac_info accepts a non-1 BF factor", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.poll();
		fake.bfFactor = 2;
		await p.ac_info();
		expect(p.mk2Model["ac_info.umains"].value).to.equal(237);
	});

	it("dc_info accepts a different reserved marker byte", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		await p.poll();
		fake.dcMarker = 0x00;
		await p.dc_info();
		expect(p.mk2Model["dc_info.ubat"].value).to.be.closeTo(13.02, 0.01);
	});

	it("led_status accepts a short protocol frame", async () => {
		const fake = new FakeMk2Connection();
		fake.ledDataLength = 3;
		const p = protocolWith(fake);
		await p.led_status();
		expect(p.mk2Model["led.mains"].value).to.equal(1);
	});

	it("led_status accepts a frame without the trailing 0x00 (issue #43)", async () => {
		const fake = new FakeMk2Connection();
		// MK2 >= 1130128 omits the trailing 0x00 (§4 note b): length 4 + checksum
		fake.ledDataLength = 2;
		const p = protocolWith(fake);
		await p.led_status();
		expect(p.mk2Model["led.mains"].value).to.equal(1);
		expect(p.mk2Model["led.inverter"].value).to.equal(0);
	});

	it("address accepts a longer response frame", async () => {
		const fake = new FakeMk2Connection();
		const p = protocolWith(fake);
		// the default address frame already exercises the minimum length
		await p.address();
		expect(fake.requests.length).to.equal(1);
	});
});
