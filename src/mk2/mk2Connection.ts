import { Mk2Serial } from "./serialWrapper";

import * as util from "util";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export enum mk2SpezialFrame {
	normal = 0xFF,
	infox20 = 0x20,
	infox21 = 0x21,
	masterMultiLed = 0x41,
	ramReadOk = 0x85,
}

/**
 * Robust MK2 serial connection.
 *
 * The previous implementation relied on fixed sleeps and unbounded reads. This
 * version reads length-prefixed frames, validates checksums, applies timeouts
 * and propagates communication errors to the caller instead of silently
 * swallowing them.
 */
export class Mk2Connection {
	portPath: string;
	port: Mk2Serial;
	debug = false;
	busy = false;
	synced = false;
	log: ioBroker.Logger;
	/** MK2 firmware version and mode byte from the last version frame (§3.4). */
	mk2Version: number | null = null;
	mk2Mode: number | null = null;

	constructor(portPath: string, log: ioBroker.Logger, port?: Mk2Serial) {
		this.portPath = portPath;
		this.log = log;
		this.debug = this.log?.level == "debug";
		this.port = port ?? new Mk2Serial(portPath, log);
	}

	async waitForFreeLine(): Promise<void> {
		while (this.busy) {
			await sleep(30);
		}
	}

	/** Open the port and synchronise once; resynchronise after a reconnect. */
	async ensureSynced(): Promise<void> {
		if (!this.port.isOpen()) {
			this.synced = false;
			await this.port.open();
		}
		if (!this.synced) {
			await this.sync();
		}
	}

	async sync(): Promise<void> {
		if (!this.port.isOpen()) {
			await this.port.open();
		}
		await this.port.flush_Workaround();

		const deadline = Date.now() + 5000;
		while (Date.now() < deadline) {
			const frame = await this.receiveFrame(1000);
			if (frame[1] == mk2SpezialFrame.normal && frame[2] == 0x56) {
				// 'V' <Version0..3> <Mode>; the mode byte also tells VE 9-bit from
				// VE.Bus and carries the current address (§3.4).
				if (frame.length >= 8) {
					this.mk2Version = (frame[3] | (frame[4] << 8) | (frame[5] << 16) | (frame[6] << 24)) >>> 0;
					this.mk2Mode = frame[7];
				}
				this.synced = true;
				this.log.debug("sync: version frame received");
				return;
			}
		}
		this.synced = false;
		throw new Error("Sync - receive no version frame - no mk2 connected ?");
	}

	/**
	 * Send a request and decode one valid response frame.
	 *
	 * Version frames and unknown frames are ignored until the response or a
	 * timeout arrives. Errors (timeout, checksum, decode) are propagated to the
	 * caller so that failed writes never look successful.
	 */
	async communicate(request: Buffer, decode: (response: Buffer) => Promise<void>): Promise<void> {
		return this.communicateMulti(request, async (response: Buffer) => {
			await decode(response);
			return true;
		});
	}

	/**
	 * Send a request and decode as many response frames as the device sends.
	 *
	 * The MK2 packs up to three 3-byte Winmon frames into one MK2 frame, so a
	 * command like CommandGetSettingInfo (five responses) arrives as several MK2
	 * frames. `decode` returns true once the answer is complete. With
	 * `allowQuietEnd` a read timeout after at least one decoded frame ends the
	 * exchange instead of failing, because older firmware legitimately sends
	 * fewer responses than the current protocol describes.
	 */
	async communicateMulti(
		request: Buffer,
		decode: (response: Buffer) => Promise<boolean>,
		options: { allowQuietEnd?: boolean; readTimeoutMs?: number } = {},
	): Promise<void> {
		await this.waitForFreeLine();
		this.busy = true;
		let decoded = 0;

		try {
			await this.ensureSynced();
			await this.port.flush_Workaround();

			this.frame_debug("SEND ->", request);
			await this.port.write(request);

			const deadline = Date.now() + 2000;
			while (Date.now() < deadline) {
				let frame: Buffer;
				try {
					frame = await this.receiveFrame(options.readTimeoutMs ?? 1000);
				} catch (error) {
					if (options.allowQuietEnd && decoded > 0) {
						this.log.debug("communicateMulti: quiet end after " + decoded + " frame(s)");
						return;
					}
					throw error;
				}
				const spezial = frame[1] as number;
				const frameType = frame[2] as number;

				// The MK2 may send a version frame while responding; it is not a
				// protocol error and must not abort the whole poll.
				if (spezial == mk2SpezialFrame.normal && frameType == 0x56) {
					this.log.debug("VERSION FRAME ignored while waiting for response");
					continue;
				}

				if (
					spezial == mk2SpezialFrame.normal ||
					spezial == mk2SpezialFrame.infox20 ||
					spezial == mk2SpezialFrame.infox21 ||
					spezial == mk2SpezialFrame.masterMultiLed ||
					spezial == mk2SpezialFrame.ramReadOk
				) {
					decoded++;
					if (await decode(frame)) {
						return;
					}
				}
			}
			throw new Error("Timeout waiting for response from MK2");
		} finally {
			this.busy = false;
		}
	}

	/**
	 * Read one complete length-prefixed frame, with timeout and checksum
	 * validation. Partial reads are accumulated until the whole frame arrived.
	 */
	async receiveFrame(timeoutMs = 1500): Promise<Buffer> {
		const deadline = Date.now() + timeoutMs;
		let buf = Buffer.alloc(0);

		while (Date.now() < deadline) {
			if (buf.length == 0) {
				const lengthByte = this.port.read(1);
				if (lengthByte) {
					buf = Buffer.concat([buf, lengthByte]);
				} else {
					await sleep(5);
					continue;
				}
			}

			// Bit 7 of the length byte means an LED status frame is appended;
			// it must not be counted as part of the frame length.
			const len = buf[0] & 0x7F;
			if (len == 0) {
				throw new Error("Invalid MK2 frame length 0");
			}
			// Length excludes the length and checksum bytes, so the complete
			// frame has len + 2 bytes (length + len + checksum).
			const needed = len + 2;

			while (buf.length < needed && Date.now() < deadline) {
				const chunk = this.port.read(needed - buf.length);
				if (chunk) {
					buf = Buffer.concat([buf, chunk]);
				} else {
					await sleep(5);
				}
			}

			if (buf.length < needed) {
				throw new Error("Timeout while receiving complete MK2 frame");
			}

			const frame = buf.slice(0, needed);
			if (!this.checksum(frame)) {
				throw new Error("MK2 frame checksum error");
			}
			this.frame_debug("RECV <-", frame);
			return frame;
		}
		throw new Error("Timeout waiting for MK2 frame");
	}

	checksum(frame: Buffer): boolean {
		let sum = 0;
		for (let i = 0; i < frame.length; i++) {
			sum += frame[i];
		}
		return sum % 256 == 0;
	}

	frame_debug(txt: string, frame: Buffer, data?: any): void {
		if (this.debug) {
			this.log.debug("-------------------------------------------------------------------------------------");
			this.log.debug(txt + util.inspect(frame));
			let legend = "       ";
			for (let i = 0; i < frame.length; i++) {
				legend += i.toString().padStart(3, " ");
			}
			this.log.debug(txt + legend);
			if (data) this.log.debug(data);
			this.log.debug("-------------------------------------------------------------------------------------");
		}
	}
}
