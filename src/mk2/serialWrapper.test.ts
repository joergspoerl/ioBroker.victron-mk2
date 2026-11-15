import { expect } from "chai";
import Module from "module";
import { Mk2Serial } from "./serialWrapper";

describe("serialWrapper open error handling (issue #13)", () => {
	it("rejects instead of hanging when the serialport import fails", async () => {
		const anyModule = Module as any;
		const original = anyModule._load;
		anyModule._load = function (request: string, ...rest: any[]) {
			if (request === "serialport") {
				throw new Error("simulated missing native binding");
			}
			return original.call(this, request, ...rest);
		};
		try {
			const serial = new Mk2Serial("/dev/does-not-matter");
			// Before the fix this promise stayed pending forever (and produced an
			// unhandled rejection) instead of rejecting.
			await expect(serial.open()).to.be.rejectedWith("simulated missing native binding");
		} finally {
			anyModule._load = original;
		}
	});
});
