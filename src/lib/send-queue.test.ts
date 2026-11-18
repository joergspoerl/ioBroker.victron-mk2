import { expect } from "chai";
import { processToSendQueue, processControlWrites, QueueItem } from "./send-queue";
import { Mk2ReadbackError, Mk2ValidationError } from "./errors";
import { Mk2Protocol } from "../mk2/mk2Protocol";
import { asConnection, FakeMk2Connection } from "../test-utils/fake-mk2";

const log = {
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
};

function fakeMk2WithFailure(failuresBeforeSuccess: number) {
	let attempts = 0;
	const mk2 = {
		mk2Model: {
			"control.test": {
				value: 0,
				setFunc: async () => {
					attempts++;
					if (attempts <= failuresBeforeSuccess) {
						throw new Error("simulated failure");
					}
				},
			},
		},
	};
	return { mk2, attempts: () => attempts };
}

describe("send queue", () => {
	it("processes a valid control write", async () => {
		const { mk2 } = fakeMk2WithFailure(0);
		const queue: QueueItem[] = [{ name: "control.test", value: 10, attempts: 0 }];
		await processToSendQueue(mk2 as any, queue, log as any);
		expect(queue).to.have.length(0);
	});

	it("retries a failed write on a later cycle", async () => {
		const { mk2, attempts } = fakeMk2WithFailure(1);
		const queue: QueueItem[] = [{ name: "control.test", value: 10, attempts: 0 }];
		await processToSendQueue(mk2 as any, queue, log as any);
		expect(queue).to.have.length(1);
		expect(queue[0].attempts).to.equal(1);
		await processToSendQueue(mk2 as any, queue, log as any);
		expect(queue).to.have.length(0);
		expect(attempts()).to.equal(2);
	});

	it("drops a permanently failing write after the attempt limit", async () => {
		const { mk2 } = fakeMk2WithFailure(99);
		const queue: QueueItem[] = [{ name: "control.test", value: 10, attempts: 0 }];
		for (let i = 0; i < 4; i++) {
			await processToSendQueue(mk2 as any, queue, log as any);
		}
		expect(queue).to.have.length(0);
	});

	it("does not retry validation errors", async () => {
		let attempts = 0;
		const mk2 = {
			mk2Model: {
				"control.test": {
					value: 0,
					setFunc: async () => {
						attempts++;
						throw new Mk2ValidationError("out of range");
					},
				},
			},
		};
		const queue: QueueItem[] = [{ name: "control.test", value: 500, attempts: 0 }];
		await processToSendQueue(mk2 as any, queue, log as any);
		expect(queue).to.have.length(0);
		expect(attempts).to.equal(1);
	});

	it("returns the completed writes for acknowledgement (issue #17)", async () => {		const { mk2 } = fakeMk2WithFailure(0);
		const queue: QueueItem[] = [{ name: "control.test", value: 10, attempts: 0 }];
		const completed = await processToSendQueue(mk2 as any, queue, log as any);
		expect(completed).to.have.length(1);
		expect(completed[0].name).to.equal("control.test");
	});

	it("acknowledges the value the device actually applied", async () => {
		const mk2 = {
			mk2Model: {
				"control.test": { value: 0, setFunc: async () => 3.1 },
			},
		};
		const queue: QueueItem[] = [{ name: "control.test", value: 1, attempts: 0 }];
		const completed = await processToSendQueue(mk2 as any, queue, log as any);
		expect(completed).to.have.length(1);
		expect(completed[0].value).to.equal(3.1);
	});

	it("drops expired control writes instead of firing them late (issue #39)", async () => {
		let calls = 0;
		const mk2 = {
			mk2Model: {
				"control.test": { value: 0, setFunc: async () => { calls++; } },
			},
		};
		const expired: QueueItem[] = [{ name: "control.test", value: 1, attempts: 0, ts: Date.now() - 120000 }];
		await processToSendQueue(mk2 as any, expired, log as any);
		expect(calls).to.equal(0);
		expect(expired).to.have.length(0);

		const fresh: QueueItem[] = [{ name: "control.test", value: 1, attempts: 0, ts: Date.now() }];
		await processToSendQueue(mk2 as any, fresh, log as any);
		expect(calls).to.equal(1);
	});

	it("does not retry readback failures, to avoid repeated EEPROM writes (issue #46)", async () => {
		let attempts = 0;
		const mk2 = {
			mk2Model: {
				"control.test": {
					value: 0,
					setFunc: async () => {
						attempts++;
						throw new Mk2ReadbackError("mismatch");
					},
				},
			},
		};
		const queue: QueueItem[] = [{ name: "control.test", value: 500, attempts: 0 }];
		await processToSendQueue(mk2 as any, queue, log as any);
		expect(attempts).to.equal(1);
		expect(queue).to.have.length(0);
	});

	it("reports unknown control states without throwing", async () => {
		const { mk2 } = fakeMk2WithFailure(0);
		const queue: QueueItem[] = [{ name: "control.unknown", value: 10, attempts: 0 }];
		await processToSendQueue(mk2 as any, queue, log as any);
		expect(queue).to.have.length(0);
	});

	it("refreshes the switch register before pending writes only (issue #15)", async () => {
		const fake = new FakeMk2Connection();
		const p = new Mk2Protocol("fake", log as any, asConnection(fake));
		const isF5 = (r: Buffer) => r[2] == 0x46 && r[3] == 0x05;

		await processControlWrites(p, [], log as any);
		expect(fake.requests.filter(isF5).length).to.equal(0);

		const queue: QueueItem[] = [{ name: "control.set_assist", value: 10, attempts: 0 }];
		await processControlWrites(p, queue, log as any);
		const f5Index = fake.requests.findIndex(isF5);
		const writeIndex = fake.requests.findIndex((r) => r[2] == 0x53);
		expect(f5Index).to.be.greaterThan(-1);
		expect(f5Index).to.be.lessThan(writeIndex);
		expect(queue).to.have.length(0);
	});
});

describe("control error visibility (issue #63)", () => {
	it("records a rejected write in diag.last_control_error", async () => {
		const mk2 = {
			mk2Model: {
				"control.test": {
					value: 0,
					setFunc: async () => {
						throw new Mk2ValidationError("out of range");
					},
				},
				"diag.last_control_error": { value: "" },
			},
		};
		const queue: QueueItem[] = [{ name: "control.test", value: 500, attempts: 0 }];
		await processToSendQueue(mk2 as any, queue, log as any);
		expect(mk2.mk2Model["diag.last_control_error"].value).to.contain("control.test");
		expect(mk2.mk2Model["diag.last_control_error"].value).to.contain("out of range");
	});

	it("clears the error after a successful write", async () => {
		const { mk2 } = fakeMk2WithFailure(0) as any;
		mk2.mk2Model["diag.last_control_error"] = { value: "control.test: earlier" };
		const queue: QueueItem[] = [{ name: "control.test", value: 10, attempts: 0 }];
		await processToSendQueue(mk2, queue, log as any);
		expect(mk2.mk2Model["diag.last_control_error"].value).to.equal("");
	});
});
