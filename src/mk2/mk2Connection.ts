import { Mk2Serial } from "./serialWrapper";
import { Mk2TransportError } from "../lib/errors";

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
	/** Diagnostics (issue #8), counted since the adapter started. */
	timeouts = 0;
	checksumErrors = 0;
	lastError = "";
	/**
	 * Response budget per frame. Protocol §3.3 recommends 500 ms, but on a busy
	 * host (ioBroker on a Raspberry Pi) 1500 ms has proven reliable; the F5
	 * response gets its own longer budget either way.
	 */
	responseTimeoutMs = 1500;
	/** Receive accumulator; bytes after a complete frame stay for the next read. */
	private rxBuffer = Buffer.alloc(0);

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

	/**
	 * Synchronise on the MK2 version frame.
	 *
	 * When the port is opened in the middle of a transmission, the byte stream
	 * does not start at a frame boundary. Instead of trusting the first length
	 * byte (which used to produce a startup timeout on every adapter start), scan
	 * the stream for a complete, checksum-valid version frame and keep the
	 * remaining bytes for the next read.
	 */
	async sync(): Promise<void> {
		if (!this.port.isOpen()) {
			await this.port.open();
		}
		await this.discardInput();

		const deadline = Date.now() + 5000;
		while (Date.now() < deadline) {
			// read() without a size returns everything buffered. A sized read would
			// return null until that many bytes are available, which would stall
			// the synchronisation forever on a 9-byte version frame.
			const chunk = this.port.readAvailable();
			if (chunk) {
				this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
			}
			if (this.extractVersionFrame()) {
				this.synced = true;
				this.log.debug("sync: version frame received");
				return;
			}
			await sleep(20);
		}
		this.synced = false;
		throw new Mk2TransportError("Sync - receive no version frame - no mk2 connected ?");
	}

	/** Find a complete, checksum-valid 'V' frame anywhere in the rx buffer. */
	private extractVersionFrame(): boolean {
		const buf = this.rxBuffer;
		for (let i = 0; i + 3 < buf.length; i++) {
			if (buf[i + 1] !== 0xff || buf[i + 2] !== 0x56) {
				continue;
			}
			const len = buf[i] & 0x7f;
			if (len < 5) {
				continue;
			}
			const total = len + 2;
			if (i + total > buf.length) {
				// Incomplete candidate: wait for more bytes instead of discarding it.
				this.rxBuffer = buf.slice(i);
				return false;
			}
			const frame = buf.slice(i, i + total);
			if (!this.checksum(frame)) {
				continue; // false positive inside other data, keep scanning
			}
			// 'V' <Version0..3> <Mode> (§3.4)
			this.mk2Version = (frame[3] | (frame[4] << 8) | (frame[5] << 16) | (frame[6] << 24)) >>> 0;
			this.mk2Mode = frame[7];
			this.rxBuffer = buf.slice(i + total);
			return true;
		}
		// Keep only a possible split frame marker, drop the rest of the noise.
		this.rxBuffer = buf.slice(Math.max(0, buf.length - 2));
		return false;
	}

	/** Drop stale input, both in the driver buffer and in our own accumulator. */
	private async discardInput(): Promise<void> {
		this.rxBuffer = Buffer.alloc(0);
		await this.port.flush_Workaround();
	}

	/**
	 * Send a request and decode one valid response frame.
	 *
	 * Version frames and unknown frames are ignored until the response or a
	 * timeout arrives. Errors (timeout, checksum, decode) are propagated to the
	 * caller so that failed writes never look successful.
	 */
	async communicate(request: Buffer, decode: (response: Buffer) => Promise<void>, options: { readTimeoutMs?: number } = {}): Promise<void> {
		return this.communicateMulti(request, async (response: Buffer) => {
			await decode(response);
			return true;
		}, options);
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
			await this.discardInput();

			this.frame_debug("SEND ->", request);
			await this.port.write(request);

			const deadline = Date.now() + 2000;
			while (Date.now() < deadline) {
				let frame: Buffer;
				try {
					frame = await this.receiveFrame(options.readTimeoutMs ?? this.responseTimeoutMs);
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
	 * The default follows the configured response budget (protocol §3.3 names
	 * 500 ms; a busy host may need more). F5 gets a longer budget either way.
	 */
	async receiveFrame(timeoutMs = this.responseTimeoutMs): Promise<Buffer> {
		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			if (this.rxBuffer.length == 0) {
				const lengthByte = this.port.read(1);
				if (lengthByte) {
					this.rxBuffer = Buffer.concat([this.rxBuffer, lengthByte]);
				} else {
					await sleep(5);
					continue;
				}
			}

			// Bit 7 of the length byte means an LED status frame is appended;
			// it must not be counted as part of the frame length.
			const len = this.rxBuffer[0] & 0x7F;
			if (len == 0) {
				await this.fail("protocol", "Invalid MK2 frame length 0");
			}
			// Length excludes the length and checksum bytes, so the complete
			// frame has len + 2 bytes (length + len + checksum).
			const needed = len + 2;

			while (this.rxBuffer.length < needed && Date.now() < deadline) {
				const chunk = this.port.read(needed - this.rxBuffer.length);
				if (chunk) {
					this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
				} else {
					await sleep(5);
				}
			}

			if (this.rxBuffer.length < needed) {
				await this.fail("timeout", "Timeout while receiving complete MK2 frame");
			}

			const frame = this.rxBuffer.slice(0, needed);
			if (!this.checksum(frame)) {
				await this.fail("checksum", "MK2 frame checksum error");
			}
			this.rxBuffer = this.rxBuffer.slice(needed);
			this.frame_debug("RECV <-", frame);
			return frame;
		}
		await this.fail("timeout", "Timeout waiting for MK2 frame");
		throw new Error("unreachable");
	}

	/**
	 * Count the failure and invalidate the connection. A timeout or checksum
	 * error means the byte stream cannot be trusted any more, so the port is
	 * closed and the next poll reopens and resynchronises (issue #8).
	 */
	private async fail(kind: "timeout" | "checksum" | "protocol", message: string): Promise<void> {
		if (kind == "timeout") this.timeouts++;
		if (kind == "checksum") this.checksumErrors++;
		this.lastError = message;
		this.synced = false;
		this.rxBuffer = Buffer.alloc(0);
		try {
			await this.port.close();
		} catch {
			// best effort; the reopen path handles a closed or broken port
		}
		throw new Error(message);
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
