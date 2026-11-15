import { expect } from "chai";
import { Mk2Connection } from "./mk2Connection";
import { Mk2TransportError } from "../lib/errors";
import { FakeMk2Serial, mk2Frame, versionFrame } from "../test-utils/fake-mk2";

const log = {
	level: "info",
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
};

function connWith(fake: FakeMk2Serial): Mk2Connection {
	return new Mk2Connection("fake", log as any, fake as any);
}

describe("Mk2Connection", () => {
	describe("receiveFrame", () => {
		it("reads a complete length-prefixed frame", async () => {
			const fake = new FakeMk2Serial();
			const frame = versionFrame();
			fake.push(frame);
			const conn = connWith(fake);
			const result = await conn.receiveFrame();
			expect(result.equals(frame)).to.equal(true);
		});

		it("accumulates partial reads until the frame is complete", async () => {
			const fake = new FakeMk2Serial();
			fake.splitResponses = true;
			const frame = versionFrame();
			for (let i = 0; i < frame.length; i += 2) {
				fake.push(frame.slice(i, i + 2));
			}
			const conn = connWith(fake);
			const result = await conn.receiveFrame();
			expect(result.equals(frame)).to.equal(true);
		});

		it("rejects a frame with a wrong checksum", async () => {
			const fake = new FakeMk2Serial();
			const frame = versionFrame();
			frame[frame.length - 1] ^= 0xFF;
			fake.push(frame);
			const conn = connWith(fake);
			await expect(conn.receiveFrame()).to.be.rejectedWith("checksum");
		});

		it("times out when no data arrives", async () => {
			const fake = new FakeMk2Serial();
			const conn = connWith(fake);
			await expect(conn.receiveFrame(40)).to.be.rejectedWith("Timeout");
		});
	});

	describe("sync", () => {
		it("captures the MK2 version and mode from the version frame", async () => {
			const fake = new FakeMk2Serial();
			fake.push(versionFrame());
			const conn = connWith(fake);
			await conn.sync();
			expect(conn.synced).to.equal(true);
			expect(conn.mk2Version).to.equal(0x00113e98);
			expect(conn.mk2Mode).to.equal(0x57);
		});
	});

	describe("failure recovery (issue #8)", () => {
		it("counts checksum errors, closes the port and invalidates the sync", async () => {
			const frame = versionFrame();
			frame[frame.length - 1] ^= 0xFF;
			const fake = new FakeMk2Serial();
			fake.push(frame);
			await fake.open();
			const conn = connWith(fake);
			await expect(conn.receiveFrame(100)).to.be.rejectedWith("checksum");
			expect(conn.checksumErrors).to.equal(1);
			expect(conn.synced).to.equal(false);
			expect(fake.isOpen()).to.equal(false);
			expect(conn.lastError).to.contain("checksum");
		});

		it("counts timeouts and resynchronises on the next call", async () => {
			const fake = new FakeMk2Serial();
			await fake.open();
			const conn = connWith(fake);
			await expect(conn.receiveFrame(40)).to.be.rejectedWith("Timeout");
			expect(conn.timeouts).to.equal(1);
			expect(fake.isOpen()).to.equal(false);
			expect(conn.lastError).to.contain("Timeout");

			fake.push(versionFrame());
			await conn.ensureSynced();
			expect(fake.isOpen()).to.equal(true);
			expect(conn.synced).to.equal(true);
		});

		it("classifies a missing response as a transport error (issue #40)", async () => {
			const fake = new FakeMk2Serial(); // never answers
			fake.push(versionFrame());
			const conn = connWith(fake);
			await expect(conn.communicate(mk2Frame(0x41, [0x01, 0x00]), async () => undefined, { readTimeoutMs: 30 }))
				.to.be.rejectedWith(Mk2TransportError);
		});
	});

	describe("sync robustness", () => {
		it("synchronises when the stream starts with garbage", async () => {
			const fake = new FakeMk2Serial();
			fake.push(Buffer.from([0x00, 0x13, 0x77]));
			fake.push(versionFrame());
			const conn = connWith(fake);
			await conn.sync();
			expect(conn.synced).to.equal(true);
			expect(conn.mk2Version).to.equal(0x00113e98);
		});

		it("synchronises when the version frame arrives byte by byte", async () => {
			const fake = new FakeMk2Serial();
			for (const b of versionFrame()) {
				fake.push(Buffer.from([b]));
			}
			const conn = connWith(fake);
			await conn.sync();
			expect(conn.synced).to.equal(true);
		});

		it("ignores a version-looking sequence with a broken checksum", async () => {
			const fake = new FakeMk2Serial();
			const bad = versionFrame();
			bad[bad.length - 1] ^= 0xFF;
			fake.push(bad);
			fake.push(versionFrame());
			const conn = connWith(fake);
			await conn.sync();
			expect(conn.synced).to.equal(true);
			expect(conn.mk2Version).to.equal(0x00113e98);
		});

		it("keeps frames that arrive after the version frame", async () => {
			const fake = new FakeMk2Serial();
			fake.push(versionFrame());
			fake.push(mk2Frame(0x41, [0x01, 0x00]));
			const conn = connWith(fake);
			await conn.sync();
			const next = await conn.receiveFrame(200);
			expect(next[2]).to.equal(0x41);
		});

		it("finds a valid frame behind an incomplete false candidate (issue #20)", async () => {
			const fake = new FakeMk2Serial();
			// 7f ff 56 looks like a long version frame but is incomplete; the real
			// version frame follows immediately in the same buffer.
			fake.push(Buffer.from([0x7f, 0xff, 0x56]));
			fake.push(versionFrame());
			const conn = connWith(fake);
			await conn.sync();
			expect(conn.synced).to.equal(true);
			expect(conn.mk2Version).to.equal(0x00113e98);
		});
	});

	describe("communicate", () => {		it("decodes a valid response and records the request", async () => {
			const response = mk2Frame(0x41, [0x01, 0x00]);
			const fake = new FakeMk2Serial(() => response);
			fake.push(versionFrame());
			const conn = connWith(fake);
			let decoded: Buffer | undefined;
			await conn.communicate(mk2Frame(0x41, [0x01, 0x00]), async (frame) => {
				decoded = frame;
			});
			expect(decoded?.equals(response)).to.equal(true);
			expect(fake.written).to.have.length(1);
		});

		it("ignores a version frame while waiting for the real response", async () => {
			const response = mk2Frame(0x41, [0x01, 0x00]);
			const fake = new FakeMk2Serial(() => [versionFrame(), response]);
			fake.push(versionFrame());
			const conn = connWith(fake);
			let decoded: Buffer | undefined;
			await conn.communicate(mk2Frame(0x41, [0x01, 0x00]), async (frame) => {
				decoded = frame;
			});
			expect(decoded?.equals(response)).to.equal(true);
		});

		it("propagates a timeout when the device does not answer", async () => {
			const fake = new FakeMk2Serial(() => null);
			fake.push(versionFrame());
			const conn = connWith(fake);
			await expect(
				conn.communicate(mk2Frame(0x41, [0x01, 0x00]), async () => undefined),
			).to.be.rejectedWith("Timeout");
		});

		it("propagates a checksum error", async () => {
			const response = mk2Frame(0x41, [0x01, 0x00]);
			response[response.length - 1] ^= 0xFF;
			const fake = new FakeMk2Serial(() => response);
			fake.push(versionFrame());
			const conn = connWith(fake);
			await expect(
				conn.communicate(mk2Frame(0x41, [0x01, 0x00]), async () => undefined),
			).to.be.rejectedWith("checksum");
		});

		it("propagates a decode exception", async () => {
			const response = mk2Frame(0x41, [0x01, 0x00]);
			const fake = new FakeMk2Serial(() => response);
			fake.push(versionFrame());
			const conn = connWith(fake);
			await expect(
				conn.communicate(mk2Frame(0x41, [0x01, 0x00]), async () => {
					throw new Error("decode failed");
				}),
			).to.be.rejectedWith("decode failed");
		});
	});

	describe("sync/ensureSynced", () => {
		it("syncs on a version frame and only once per connection", async () => {
			const fake = new FakeMk2Serial();
			fake.push(versionFrame());
			const conn = connWith(fake);
			await conn.ensureSynced();
			expect(conn.synced).to.equal(true);
			expect(fake.isOpen()).to.equal(true);
			// a second call must not need another frame
			await conn.ensureSynced();
			expect(conn.synced).to.equal(true);
		});

		it("resynchronises after the port was closed", async () => {
			const fake = new FakeMk2Serial();
			fake.push(versionFrame());
			const conn = connWith(fake);
			await conn.ensureSynced();
			await fake.close();
			fake.push(versionFrame());
			await conn.ensureSynced();
			expect(conn.synced).to.equal(true);
		});
	});
});

describe("concurrency (issue #23)", () => {
	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	it("serialises concurrent exchanges instead of interleaving them", async () => {
		const response = mk2Frame(0x41, [0x01, 0x00]);
		const fake = new FakeMk2Serial(() => response);
		fake.push(versionFrame());
		const conn = new Mk2Connection("fake", log as any, fake as any);
		const order: string[] = [];

		await Promise.all([
			conn.communicate(mk2Frame(0x41, [0x01, 0x00]), async () => {
				order.push("a-start");
				await sleep(60);
				order.push("a-end");
			}),
			conn.communicate(mk2Frame(0x41, [0x01, 0x00]), async () => {
				order.push("b-start");
				await sleep(1);
				order.push("b-end");
			}),
		]);
		expect(order).to.deep.equal(["a-start", "a-end", "b-start", "b-end"]);
	});

	it("honours a responseTimeout above the former fixed deadline (issue #48)", async function () {
		this.timeout(10000);
		const response = mk2Frame(0x41, [0x01, 0x00]);
		const fake = new FakeMk2Serial(() => response);
		fake.responseDelayMs = 2100; // longer than the old fixed 2000 ms deadline
		fake.push(versionFrame());
		const conn = new Mk2Connection("fake", log as any, fake as any);
		conn.responseTimeoutMs = 3000;
		await conn.communicate(mk2Frame(0x41, [0x01, 0x00]), async () => undefined);
		expect(conn.timeouts).to.equal(0);
	});
});
