#!/usr/bin/env node
/**
 * Live hardware test for the MK2 adapter (v0.1.0).
 *
 * The ioBroker victron-mk2 adapter must be stopped first (exclusive serial port):
 *   iobroker stop victron-mk2.0
 *
 * Examples (run from the repo root, with build/ present):
 *   node scripts/live-mk2-test.js                 # read-only poll
 *   node scripts/live-mk2-test.js --write 10      # set 10 A
 *   node scripts/live-mk2-test.js --zero-grid     # 0 A (solar/inverter mode)
 *   node scripts/live-mk2-test.js --inverter-only # switch state 2
 *   node scripts/live-mk2-test.js --grid          # grid mode (max limit)
 *
 * The MultiPlus AC output must be isolated from the house for these tests.
 * A failed/looping zero-grid test is reverted to 10 A automatically.
 */
const path = require("path");
const { Mk2Protocol } = require(path.join(__dirname, "../build/mk2/mk2Protocol"));

const log = {
	level: process.argv.includes("--debug") ? "debug" : "info",
	debug: (...a) => console.log(...a),
	info: (...a) => console.log(...a),
	warn: (...a) => console.warn(...a),
	error: (...a) => console.error(...a),
};

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarize(p) {
	const m = p.mk2Model;
	return {
		state: m["state.state"].value,
		acState: m["ac_info.state"].value,
		umains: m["ac_info.umains"].value,
		imains: m["ac_info.imains"].value,
		fmains: m["ac_info.fmains"].value,
		uinv: m["ac_info.uinv"].value,
		iinv: m["ac_info.iinv"].value,
		ubat: m["dc_info.ubat"].value,
		ibat: m["dc_info.ibat"].value,
		limit: m["assist.limit"].value,
		min: m["assist.minlimit"].value,
		max: m["assist.maxlimit"].value,
		mains: m["led.mains"].value,
		inverter: m["led.inverter"].value,
		overload: m["led.overload"].value,
		lowBat: m["led.low_bat"].value,
		temp: m["led.temp"].value,
		disableAES: m["setting.flag.DisableAES"].value,
		assistEnabled: m["setting.flag.AssistEnabled"].value,
	};
}

async function pollAndPrint(p, label) {
	await p.poll();
	console.log(label, JSON.stringify(summarize(p)));
}

async function main() {
	const args = process.argv.slice(2);
	const p = new Mk2Protocol("/dev/ttyUSB-Serial-1", log);

	try {
		await pollAndPrint(p, "initial");

		if (args.includes("--write")) {
			const idx = args.indexOf("--write");
			const a = Number(args[idx + 1]);
			if (!Number.isFinite(a)) throw new Error("invalid --write value");
			await p.set_assist(a);
			await sleep(2000);
			await pollAndPrint(p, `after write ${a} A`);
		}

		if (args.includes("--zero-grid")) {
			await p.set_grid_mode(1);
			for (let i = 0; i < 5; i++) {
				await sleep(2000);
				await pollAndPrint(p, `zero-grid ${i + 1}/5`);
				const state = p.mk2Model["state.state"].value;
				if (state === 10 || state === 20) {
					console.error("startup/off detected, restoring 10 A");
					await p.set_assist(10);
					break;
				}
			}
		}

		if (args.includes("--inverter-only")) {
			await p.set_grid_mode(2);
			await sleep(2000);
			await pollAndPrint(p, "inverter-only");
		}

		if (args.includes("--switch")) {
			const idx = args.indexOf("--switch");
			const s = Number(args[idx + 1]);
			await p.set_switch_state(s);
			await sleep(2000);
			await pollAndPrint(p, `switch state ${s}`);
		}

		if (args.includes("--grid")) {
			await p.set_grid_mode(0);
			await sleep(2000);
			await pollAndPrint(p, "grid");
		}

		// Leave the MultiPlus in a defined safe state.
		await p.set_assist(10);
		await sleep(1000);
		await pollAndPrint(p, "restored 10 A");
	} finally {
		await p.conn.port.close().catch(() => undefined);
	}
}

main().catch((err) => {
	console.error("live test failed:", err);
	process.exit(1);
});
