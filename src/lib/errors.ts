/**
 * A value that can never succeed on the device (out of range, unknown mode,
 * unsupported flag). Retrying it only produces log noise, so the send queue
 * drops it immediately instead of using its transient-error retries.
 */
export class Mk2ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Mk2ValidationError";
	}
}

/**
 * A serial/transport failure (timeout, checksum, desync, closed port). Optional
 * feature blocks must never swallow these: they mean the connection is gone.
 */
export class Mk2TransportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Mk2TransportError";
	}
}

/**
 * The device did not confirm a write (missing or mismatching readback).
 * Retrying would repeat the same EEPROM write, so the send queue drops it
 * immediately, exactly like a validation error (review M6).
 */
export class Mk2ReadbackError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Mk2ReadbackError";
	}
}
