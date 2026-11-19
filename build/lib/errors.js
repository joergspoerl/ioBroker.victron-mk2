"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mk2ReadbackError = exports.Mk2TransportError = exports.Mk2ValidationError = void 0;
/**
 * A value that can never succeed on the device (out of range, unknown mode,
 * unsupported flag). Retrying it only produces log noise, so the send queue
 * drops it immediately instead of using its transient-error retries.
 */
class Mk2ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "Mk2ValidationError";
    }
}
exports.Mk2ValidationError = Mk2ValidationError;
/**
 * A serial/transport failure (timeout, checksum, desync, closed port). Optional
 * feature blocks must never swallow these: they mean the connection is gone.
 */
class Mk2TransportError extends Error {
    constructor(message) {
        super(message);
        this.name = "Mk2TransportError";
    }
}
exports.Mk2TransportError = Mk2TransportError;
/**
 * The device did not confirm a write (missing or mismatching readback).
 * Retrying would repeat the same EEPROM write, so the send queue drops it
 * immediately, exactly like a validation error (review M6).
 */
class Mk2ReadbackError extends Error {
    constructor(message) {
        super(message);
        this.name = "Mk2ReadbackError";
    }
}
exports.Mk2ReadbackError = Mk2ReadbackError;
//# sourceMappingURL=errors.js.map