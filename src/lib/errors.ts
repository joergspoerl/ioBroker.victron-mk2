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
