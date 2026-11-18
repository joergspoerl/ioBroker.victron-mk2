"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processControlWrites = processControlWrites;
exports.processControlWritesDetailed = processControlWritesDetailed;
exports.processToSendQueue = processToSendQueue;
const errors_1 = require("./errors");
/** Record a dropped/failed control write in the model, so "pending" and
 * "discarded" are distinguishable from the outside (review N7). */
function reportControlError(mk2, item, reason) {
    const entry = mk2.mk2Model["diag.last_control_error"];
    if (entry) {
        entry.value = `${item.name}: ${reason}`;
    }
}
/**
 * Forward queued control writes. When writes are pending, the switch register is
 * refreshed first: the device is authoritative for the panel switch state, and a
 * manual change since the last poll must not be overwritten (review T5).
 */
async function processControlWrites(mk2, queue, log, maxAttempts = 3) {
    const result = await processControlWritesDetailed(mk2, queue, log, maxAttempts);
    return result.completed;
}
/** Like processControlWrites, but also reports permanently dropped writes. */
async function processControlWritesDetailed(mk2, queue, log, maxAttempts = 3) {
    if (queue.length > 0) {
        await mk2.master_multi_led_info();
    }
    return processQueue(mk2, queue, log, maxAttempts);
}
/**
 * Forward queued control writes to the MK2. Failed writes are retried on a
 * later poll cycle (bounded), never silently dropped. Unknown states are
 * reported instead of causing a TypeError.
 */
async function processToSendQueue(mk2, queue, log, maxAttempts = 3, maxAgeMs = 60000) {
    const result = await processQueue(mk2, queue, log, maxAttempts, maxAgeMs);
    return result.completed;
}
async function processQueue(mk2, queue, log, maxAttempts = 3, maxAgeMs = 60000) {
    const completed = [];
    const dropped = [];
    while (queue.length > 0) {
        const item = queue.shift();
        // A queued command must not fire minutes or hours later (review H2).
        if (item.ts && Date.now() - item.ts > maxAgeMs) {
            log.warn(`Dropping expired control write ${item.name} (older than ${Math.round(maxAgeMs / 1000)} s)`);
            reportControlError(mk2, item, "expired (TTL)");
            dropped.push(item);
            continue;
        }
        const entry = mk2.mk2Model[item.name];
        if (!entry || typeof entry.setFunc !== "function") {
            log.warn(`Dropping unknown control state ${item.name}`);
            reportControlError(mk2, item, "unknown control state");
            dropped.push(item);
            continue;
        }
        entry.value = item.value;
        try {
            const applied = await entry.setFunc(mk2, item.value);
            // A setFunc may clamp to the device range (e.g. set_assist). Acknowledge
            // the value the device actually accepted, not the raw request.
            if (typeof applied === "number")
                item.value = applied;
            completed.push(item);
            const errorEntry = mk2.mk2Model["diag.last_control_error"];
            if (errorEntry && typeof errorEntry.value === "string" && errorEntry.value.startsWith(item.name + ":")) {
                errorEntry.value = "";
            }
        }
        catch (ex) {
            if (ex instanceof errors_1.Mk2ValidationError || ex instanceof errors_1.Mk2ReadbackError) {
                // Invalid input or an unconfirmed write can never succeed by repeating;
                // retrying would only repeat the same EEPROM write.
                log.error(`Control write ${item.name} rejected: ${ex.message}`);
                reportControlError(mk2, item, ex.message);
                dropped.push(item);
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
            reportControlError(mk2, item, `failed after ${maxAttempts} attempts`);
            dropped.push(item);
        }
    }
    return { completed, dropped };
}
//# sourceMappingURL=send-queue.js.map