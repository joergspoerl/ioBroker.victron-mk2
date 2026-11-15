import { Mk2Protocol } from "../mk2/mk2Protocol";
import { Mk2ValidationError } from "./errors";

export interface QueueItem {
	name: string;
	value: number;
	attempts: number;
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
): Promise<void> {
	while (queue.length > 0) {
		const item = queue.shift()!;
		const entry = mk2.mk2Model[item.name];

		if (!entry || typeof entry.setFunc !== "function") {
			log.warn(`Dropping unknown control state ${item.name}`);
			continue;
		}

		entry.value = item.value;
		try {
			await entry.setFunc(mk2, item.value);
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
}
