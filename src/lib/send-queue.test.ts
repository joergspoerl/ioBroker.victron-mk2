import { expect } from "chai";
import { processToSendQueue, QueueItem } from "./send-queue";
import { Mk2ValidationError } from "./errors";

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

	it("reports unknown control states without throwing", async () => {		const { mk2 } = fakeMk2WithFailure(0);
		const queue: QueueItem[] = [{ name: "control.unknown", value: 10, attempts: 0 }];
		await processToSendQueue(mk2 as any, queue, log as any);
		expect(queue).to.have.length(0);
	});
});
