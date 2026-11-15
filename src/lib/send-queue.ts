import { Mk2Protocol } from "../mk2/mk2Protocol";
import { Mk2ValidationError } from "./errors";

export interface QueueItem {
	name: string;
	value: number;
	attempts: number;
	/** Creation time; entries older than the TTL are dropped instead of firing late. */
	ts?: number;
}

/**
 * Forward queued control writes. When writes are pending, the switch register is
 * refreshed first: the device is authoritative for the panel switch state, and a
 * manual change since the last poll must not be overwritten (review T5).
 */
export async function processControlWrites(
	mk2: Mk2Protocol,
	queue: QueueItem[],
	log: ioBroker.Logger,
	maxAttempts = 3,
): Promise<QueueItem[]> {
	if (queue.length > 0) {
		await mk2.master_multi_led_info();
	}
	return processToSendQueue(mk2, queue, log, maxAttempts);
}

/**
 * Forward queued control writes to the MK2. Failed writes are retried on a
 * later poll cycle (bounded), never silently dropped. Unknown states are
 * reported instead of causing a TypeError.
 */
export async function processToSendQueue(
	mk2: Mk2Protocol,
	queue: QueueItem[],
	log: ioBroker.Logger,
	maxAttempts = 3,
	maxAgeMs = 60000,
): Promise<QueueItem[]> {
	const completed: QueueItem[] = [];
	while (queue.length > 0) {
		const item = queue.shift()!;

		// A queued command must not fire minutes or hours later (review H2).
		if (item.ts && Date.now() - item.ts > maxAgeMs) {
			log.warn(`Dropping expired control write ${item.name} (older than ${Math.round(maxAgeMs / 1000)} s)`);
			continue;
		}
		const entry = mk2.mk2Model[item.name];

		if (!entry || typeof entry.setFunc !== "function") {
			log.warn(`Dropping unknown control state ${item.name}`);
			continue;
		}

		entry.value = item.value;
		try {
			await entry.setFunc(mk2, item.value);
			completed.push(item);
		} catch (ex) {
			if (ex instanceof Mk2ValidationError) {
				// Invalid input can never succeed; retrying only spams the log.
				log.error(`Control write ${item.name} rejected: ${ex.message}`);
				continue;
			}
			item.attempts++;
			if (item.attempts < maxAttempts) {
				queue.unshift(item);
				log.warn(`Control write ${item.name} failed (${ex}); retry ${item.attempts}/${maxAttempts}`);
				// Defer the retry to the next poll cycle instead of spinning.
				break;
			}
			log.error(`Control write ${item.name} failed permanently after ${maxAttempts} attempts: ${ex}`);
		}
	}
	return completed;
}
