import { expect } from "chai";
import { PollLoop } from "./poll-loop";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("poll loop shutdown (issue #22)", () => {
	it("waits for the in-flight iteration and schedules nothing afterwards", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		let iterations = 0;
		const loop = new PollLoop(async () => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			iterations++;
			await sleep(60);
			inFlight--;
		}, 5);
		loop.start(0);
		await sleep(20); // an iteration is now in flight
		await loop.stop(1000);
		expect(iterations).to.be.greaterThan(0);
		expect(maxInFlight).to.equal(1);
		const after = iterations;
		await sleep(80);
		expect(iterations).to.equal(after);
		expect(loop.isRunning).to.equal(false);
	});

	it("stop without start is a no-op", async () => {
		const loop = new PollLoop(async () => undefined, 5);
		await loop.stop(50);
		expect(loop.isRunning).to.equal(false);
	});

	it("stop during the wait interval cancels the pending timer", async () => {
		let iterations = 0;
		const loop = new PollLoop(async () => {
			iterations++;
		}, 60_000);
		loop.start(0);
		await sleep(20); // first iteration is done, the loop waits 60 s now
		const before = Date.now();
		await loop.stop(1000);
		const elapsed = Date.now() - before;
		expect(elapsed).to.be.lessThan(500);
		const after = iterations;
		await sleep(30);
		expect(iterations).to.equal(after);
		expect(loop.isRunning).to.equal(false);
	});
});
