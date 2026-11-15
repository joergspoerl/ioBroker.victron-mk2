import { Mk2Connection } from "../mk2/mk2Connection";

/** Build a protocol-correct MK2 frame: length, 0xFF, command, data, checksum. */
export function mk2Frame(command: number, data: number[] = []): Buffer {
	const len = 1 + data.length + 1;
	const body = Buffer.from([len, 0xFF, command, ...data]);
	let sum = 0;
	for (const b of body) sum += b;
	const checksum = (256 - (sum % 256)) & 0xFF;
	return Buffer.concat([body, Buffer.from([checksum])]);
}

/** VE.Bus info frames (DC/AC/MasterMultiLED) do not carry the 0xFF marker. */
export function veBusFrame(command: number, data: number[] = [], length?: number): Buffer {
	const len = length ?? 1 + data.length;
	const body = Buffer.from([len, command, ...data]);
	let sum = 0;
	for (const b of body) sum += b;
	const checksum = (256 - (sum % 256)) & 0xFF;
	return Buffer.concat([body, Buffer.from([checksum])]);
}

export function versionFrame(): Buffer {
	return mk2Frame(0x56, [0x98, 0x3E, 0x11, 0x00, 0x57]);
}

/** Pack 3-byte Winmon responses into MK2 frames, at most three per frame. */
export function winmonFrames(wFrames: number[][]): Buffer[] {
	const out: Buffer[] = [];
	for (let i = 0; i < wFrames.length; i += 3) {
		out.push(mk2Frame(0x57, wFrames.slice(i, i + 3).flat()));
	}
	return out;
}

/**
 * Fake serial port for Mk2Connection tests.
 *
 * It returns bytes in chunks (also partial frames), records writes and can be
 * configured to answer each write with a response provider.
 */
export class FakeMk2Serial {
	portPath: string;
	private incoming: Buffer[] = [];
	private buffer = Buffer.alloc(0);
	private opened = false;
	openError?: Error;
	splitResponses = false;
	written: Buffer[] = [];
	responseProvider?: (request: Buffer) => Buffer | Buffer[] | null;

	constructor(provider?: (request: Buffer) => Buffer | Buffer[] | null) {
		this.portPath = "fake";
		this.responseProvider = provider;
	}

	push(data: Buffer): void {
		this.incoming.push(data);
	}

	async open(): Promise<void> {
		if (this.openError) throw this.openError;
		this.opened = true;
	}

	async close(): Promise<void> {
		this.opened = false;
	}

	isOpen(): boolean {
		return this.opened;
	}

	async flush_Workaround(): Promise<void> {
		// deliberately no-op: tests must see all bytes they queued
	}

	async write(data: Buffer): Promise<void> {
		this.written.push(data);
		if (!this.responseProvider) return;
		const response = this.responseProvider(data);
		if (!response) return;
		const frames = Array.isArray(response) ? response : [response];
		for (const frame of frames) {
			if (this.splitResponses) {
				for (let i = 0; i < frame.length; i += 2) {
					this.incoming.push(frame.slice(i, i + 2));
				}
			} else {
				this.incoming.push(frame);
			}
		}
	}

	read(size: number): Buffer | null {
		if (this.buffer.length == 0) {
			if (this.incoming.length == 0) return null;
			this.buffer = Buffer.concat(this.incoming);
			this.incoming = [];
		}
		if (this.buffer.length == 0) return null;
		const out = this.buffer.slice(0, size);
		this.buffer = this.buffer.slice(size);
		return out;
	}
}

export interface FakeSettingInfo {
	sc: number;
	offset: number;
	def: number;
	min: number;
	max: number;
}

/**
 * Fake Mk2Connection that answers protocol commands with valid frames and
 * records every request. Used by Mk2Protocol and adapter tests.
 */
export class FakeMk2Connection {
	synced = true;
	busy = false;
	requests: Buffer[] = [];
	limit = 16;
	switchState = 3;
	currentState = 8;
	currentSubState = 0;
	bfFactor = 1;
	dcMarker = 0xB5;
	ledDataLength = 6;
	dcInverterCurrent = 0;
	dcChargeCurrent = 0;
	inverterPeriod = 20; // 20 * 0.01 = 0.2 s -> 50 Hz
	switchRegister = 0b00110000; // SwitchCharge + SwitchInvert -> On
	flags0 = (1 << 5) | (1 << 6) | (1 << 7) | (1 << 8) | (1 << 11);
	flags1 = 0;
	/** Settings that the fake device does not support (Sc = 0 / 0x91). */
	unsupportedSettings = new Set<number>();
	/** Raw setting values; ids 0/1/4 follow flags0/flags1/ibatBulk. */
	settingValues = new Map<number, number>();
	/** Per-setting overrides of scale/offset/default/min/max. */
	settingInfoOverrides = new Map<number, FakeSettingInfo>();
	ibatBulk = 120;
	mk2Version: number | null = 1130128;
	mk2Mode: number | null = 0;
	deviceSwVersion = 2612431;
	ramValues = new Map<number, number>([[13, 16000], [14, 250], [16, 65236]]);
	unsupportedRam = new Set<number>();
	ramInfoOverrides = new Map<number, { sc: number; offset: number }>();
	timeouts = 0;
	checksumErrors = 0;
	lastError = "";
	failNext?: string;

	private settingInfo(id: number): FakeSettingInfo {
		const override = this.settingInfoOverrides.get(id);
		if (override) return override;
		// Voltages are scaled by 0.01, currents by 0.1; both use the *settings*
		// rule (Sc < 0 -> 1/-Sc), which differs from the RAM rule on purpose.
		const voltage = [2, 3, 5, 11, 12, 44, 45, 46, 47, 63].includes(id);
		const current = [6, 49, 50, 51].includes(id);
		return {
			sc: voltage ? -100 : current ? -10 : 1,
			offset: 0,
			def: 0,
			min: 0,
			max: id == 4 ? 120 : id == 0 || id == 1 ? 0xffff : 10000,
		};
	}

	private settingValue(id: number): number {
		if (id == 0) return this.flags0;
		if (id == 1) return this.flags1;
		if (id == 4) return this.ibatBulk;
		if (this.settingValues.has(id)) return this.settingValues.get(id)!;
		if (id == 2) return 1420; // 14.20 V absorption
		if (id == 3) return 1340; // 13.40 V float
		return 0;
	}

	private respond(request: Buffer): Buffer[] {
		const command = request[2];
		switch (command) {
			case 0x41: // A
				return [mk2Frame(0x41, [0x01, 0x00])];
			case 0x4C: { // L
				const data = Array(this.ledDataLength).fill(0);
				data[0] = 0x01;
				data[1] = 0x00;
				return [mk2Frame(0x4C, data)];
			}
			case 0x53: // S
				this.switchState = request[3];
				this.limit = (request[5] << 8 | request[4]) / 10;
				return [mk2Frame(0x53, [])];
			case 0x46: { // F
				const frameType = request[3];
				if (frameType == 0x00) {
					// DC info: marker, ubat 1302, configurable currents and period
					return [veBusFrame(0x20, [
						this.dcMarker, 0x9A, 0x22, 0x46, 0x0C, 0x16, 0x05,
						this.dcInverterCurrent & 0xFF, (this.dcInverterCurrent >> 8) & 0xFF, (this.dcInverterCurrent >> 16) & 0xFF,
						this.dcChargeCurrent & 0xFF, (this.dcChargeCurrent >> 8) & 0xFF, (this.dcChargeCurrent >> 16) & 0xFF,
						this.inverterPeriod,
					], 0x0F)];
				}
				if (frameType == 0x01) {
					// AC info: 237.27 V, 50 Hz, state raw 0x46, phase 0x08
					return [veBusFrame(0x20, [
						this.bfFactor, 0x01, 0x22, 0x46, 0x08, 0xAF, 0x5C,
						0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC3,
					], 0x0F)];
				}
				if (frameType == 0x05) {
					// MasterMultiLED: min 3.1 A, max 16 A, actual = limit,
					// switch register configurable
					return [veBusFrame(0x41, [
						0x10, 0x00, 0x00, 0x00, 0x04,
						0x1F, 0x00, 0xA0, 0x00,
						Math.round(this.limit * 10) & 0xFF, Math.round(this.limit * 10) >> 8,
						this.switchRegister,
					], 0x0C)];
				}
				break;
			}
			case 0x57: { // W
				const sub = request[3];
				if (sub == 0x0E) {
					const state = request[4];
					if (state == 0) {
						return [mk2Frame(0x57, [0x94, this.currentState, this.currentSubState])];
					}
					// force_state: 1 equalise, 2 absorption, 3 float -> charge state 9
					const forced: { [key: number]: number } = { 1: 7, 2: 2, 3: 3 };
					this.currentState = 9;
					this.currentSubState = forced[state] ?? 0;
					return [mk2Frame(0x57, [0x94, this.currentState, this.currentSubState])];
				}
				if (sub == 0x05 || sub == 0x06) {
					// CommandSendSoftwareVersion: low/high 16-bit part
					const part = sub == 0x05 ? this.deviceSwVersion & 0xFFFF : (this.deviceSwVersion >> 16) & 0xFFFF;
					return [mk2Frame(0x57, [sub == 0x05 ? 0x82 : 0x83, part & 0xFF, (part >> 8) & 0xFF])];
				}
				if (sub == 0x30) {
					const ramId = request[4];
					if (this.unsupportedRam.has(ramId)) {
						return [mk2Frame(0x57, [0x90, 0x00, 0x00])];
					}
					const value = this.ramValues.get(ramId) ?? 0;
					return [mk2Frame(0x57, [0x85, value & 0xFF, (value >> 8) & 0xFF])];
				}
				if (sub == 0x31) {
					const settingId = request[4] | (request[5] << 8);
					if (this.unsupportedSettings.has(settingId)) {
						return [mk2Frame(0x57, [0x91, 0x00, 0x00])];
					}
					const value = this.settingValue(settingId);
					return [mk2Frame(0x57, [0x86, value & 0xFF, (value >> 8) & 0xFF])];
				}
				if (sub == 0x35) {
					const settingId = request[4] | (request[5] << 8);
					if (this.unsupportedSettings.has(settingId)) {
						// Sc = 0 means "not supported"; nothing else follows.
						return winmonFrames([[0x89, 0x00, 0x00]]);
					}
					const info = this.settingInfo(settingId);
					// Five responses, packed three plus two (protocol §7.3).
					return winmonFrames([
						[0x89, info.sc & 0xFF, (info.sc >> 8) & 0xFF],
						[0x8A, info.offset & 0xFF, (info.offset >> 8) & 0xFF],
						[0x8B, info.def & 0xFF, (info.def >> 8) & 0xFF],
						[0x8C, info.min & 0xFF, (info.min >> 8) & 0xFF],
						[0x8D, info.max & 0xFF, (info.max >> 8) & 0xFF],
					]);
				}
				if (sub == 0x33 || sub == 0x34 || request.includes(0x34)) {
					return [mk2Frame(0x57, [0x88, 0x00, 0x00])];
				}
				if (sub == 0x36) {
					// RAM scaling info: <Sc> 0x8E <Offset> 0x8F
					const ramId = request[4];
					const override = this.ramInfoOverrides.get(ramId);
					let sc = 0x7F9C; // scale 0.01
					let offset = 0;
					if (ramId == 0x05) { // IBat is signed (protocol appendix 2)
						sc = 0x8064;
					}
					if (ramId == 0x08) { // fmains: 10/((195+205)*0.0005) = 50
						sc = 0x7830;
						offset = 205;
					}
					if (ramId == 0x0D) { // SOC: scale 0.005 (protocol appendix 2)
						sc = 0x7F38;
					}
					if (ramId == 14 || ramId == 16) { // power: signed, scale 1
						sc = -1;
					}
					if (override) {
						sc = override.sc;
						offset = override.offset;
					}
					return [mk2Frame(0x57, [
						0x8E, sc & 0xFF, sc >> 8,
						0x8F, offset & 0xFF, offset >> 8,
					])];
				}
				break;
			}
		}
		throw new Error(`unexpected request ${request.toString("hex")}`);
	}

	async ensureSynced(): Promise<void> {
		this.synced = true;
	}

	frame_debug(): void {
		// no-op for tests
	}

	async sync(): Promise<void> {
		this.synced = true;
	}

	private before(request: Buffer): void {
		this.requests.push(request);
		if (this.failNext && request.toString("hex").includes(this.failNext)) {
			this.failNext = undefined;
			throw new Error("simulated communication failure");
		}
	}

	async communicate(request: Buffer, decode: (response: Buffer) => Promise<void>): Promise<void> {
		this.before(request);
		const frames = this.respond(request);
		await decode(frames[0]);
	}

	async communicateMulti(
		request: Buffer,
		decode: (response: Buffer) => Promise<boolean>,
		_options: { allowQuietEnd?: boolean; readTimeoutMs?: number } = {},
	): Promise<void> {
		this.before(request);
		for (const frame of this.respond(request)) {
			if (await decode(frame)) {
				return;
			}
		}
	}
}

export function asConnection(fake: FakeMk2Connection): Mk2Connection {
	return fake as unknown as Mk2Connection;
}
