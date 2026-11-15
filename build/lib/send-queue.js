"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processControlWrites = processControlWrites;
exports.processToSendQueue = processToSendQueue;
const errors_1 = require("./errors");
/**
 * Forward queued control writes. When writes are pending, the switch register is
 * refreshed first: the device is authoritative for the panel switch state, and a
 * manual change since the last poll must not be overwritten (review T5).
 */
async function processControlWrites(mk2, queue, log, maxAttempts = 3) {
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
async function processToSendQueue(mk2, queue, log, maxAttempts = 3, maxAgeMs = 60000) {
    const completed = [];
    while (queue.length > 0) {
        const item = queue.shift();
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
        }
        catch (ex) {
            if (ex instanceof errors_1.Mk2ValidationError || ex instanceof errors_1.Mk2ReadbackError) {
                // Invalid input or an unconfirmed write can never succeed by repeating;
                // retrying would only repeat the same EEPROM write.
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
//# sourceMappingURL=send-queue.js.map