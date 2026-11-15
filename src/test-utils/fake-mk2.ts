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
	failNext?: string;

	private respond(request: Buffer): Buffer {
		const command = request[2];
		switch (command) {
			case 0x41: // A
				return mk2Frame(0x41, [0x01, 0x00]);
			case 0x4C: { // L
				const data = Array(this.ledDataLength).fill(0);
				data[0] = 0x01;
				data[1] = 0x00;
				return mk2Frame(0x4C, data);
			}
			case 0x53: // S
				this.switchState = request[3];
				this.limit = (request[5] << 8 | request[4]) / 10;
				return mk2Frame(0x53, []);
			case 0x46: { // F
				const frameType = request[3];
				if (frameType == 0x00) {
					// DC info: marker, ubat 1302, configurable currents and period
					return veBusFrame(0x20, [
						this.dcMarker, 0x9A, 0x22, 0x46, 0x0C, 0x16, 0x05,
						this.dcInverterCurrent & 0xFF, (this.dcInverterCurrent >> 8) & 0xFF, (this.dcInverterCurrent >> 16) & 0xFF,
						this.dcChargeCurrent & 0xFF, (this.dcChargeCurrent >> 8) & 0xFF, (this.dcChargeCurrent >> 16) & 0xFF,
						this.inverterPeriod,
					], 0x0F);
				}
				if (frameType == 0x01) {
					// AC info: 237.27 V, 50 Hz, state raw 0x46, phase 0x08
					return veBusFrame(0x20, [
						this.bfFactor, 0x01, 0x22, 0x46, 0x08, 0xAF, 0x5C,
						0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC3,
					], 0x0F);
				}
				if (frameType == 0x05) {
					// MasterMultiLED: min 3.1 A, max 16 A, actual = limit,
					// switch register 0
					return veBusFrame(0x41, [
						0x10, 0x00, 0x00, 0x00, 0x04,
						0x1F, 0x00, 0xA0, 0x00,
						Math.round(this.limit * 10) & 0xFF, Math.round(this.limit * 10) >> 8,
						this.switchRegister,
					], 0x0C);
				}
				break;
			}
			case 0x57: { // W
				const sub = request[3];
				if (sub == 0x0E) {
					const state = request[4];
					if (state == 0) {
						return mk2Frame(0x57, [0x94, this.currentState, this.currentSubState]);
					}
					// force_state: 1 equalise, 2 absorption, 3 float -> charge state 9
					const forced: { [key: number]: number } = { 1: 7, 2: 2, 3: 3 };
					this.currentState = 9;
					this.currentSubState = forced[state] ?? 0;
					return mk2Frame(0x57, [0x94, this.currentState, this.currentSubState]);
				}
				if (sub == 0x31) {
					const settingId = request[4];
					if (settingId == 0x00) {
						const flags = this.flags0;
						return mk2Frame(0x57, [0x86, flags & 0xFF, flags >> 8]);
					}
					if (settingId == 0x04) {
						return mk2Frame(0x57, [0x86, 120, 0x00]);
					}
				}
				if (sub == 0x33 || sub == 0x34 || request.includes(0x34)) {
					return mk2Frame(0x57, [0x88, 0x00, 0x00]);
				}
				if (sub == 0x36) {
					// RAM scaling info: <Sc> 0x8E <Offset> 0x8F
					const ramId = request[4];
					let sc = 0x7F9C; // scale 0.01
					let offset = 0;
					if (ramId == 0x05) { // IBat is signed (protocol appendix 2)
						sc = 0x8064;
					}
					if (ramId == 0x08) { // fmains: 10/((195+205)*0.0005) = 50
						sc = 0x7830;
						offset = 205;
					}
					return mk2Frame(0x57, [
						0x8E, sc & 0xFF, sc >> 8,
						0x8F, offset & 0xFF, offset >> 8,
					]);
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

	async communicate(request: Buffer, decode: (response: Buffer) => Promise<void>): Promise<void> {
		this.requests.push(request);
		if (this.failNext && request.toString("hex").includes(this.failNext)) {
			this.failNext = undefined;
			throw new Error("simulated communication failure");
		}
		const response = this.respond(request);
		await decode(response);
	}
}

export function asConnection(fake: FakeMk2Connection): Mk2Connection {
	return fake as unknown as Mk2Connection;
}
