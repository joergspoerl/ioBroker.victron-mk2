"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processToSendQueue = processToSendQueue;
const errors_1 = require("./errors");
/**
 * Forward queued control writes to the MK2. Failed writes are retried on a
 * later poll cycle (bounded), never silently dropped. Unknown states are
 * reported instead of causing a TypeError.
 */
async function processToSendQueue(mk2, queue, log, maxAttempts = 3) {
    while (queue.length > 0) {
        const item = queue.shift();
        const entry = mk2.mk2Model[item.name];
        if (!entry || typeof entry.setFunc !== "function") {
            log.warn(`Dropping unknown control state ${item.name}`);
            continue;
        }
        entry.value = item.value;
        try {
            await entry.setFunc(mk2, item.value);
        }
        catch (ex) {
            if (ex instanceof errors_1.Mk2ValidationError) {
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
//# sourceMappingURL=send-queue.js.map