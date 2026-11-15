"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollLoop = void 0;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * The adapter's poll loop with a clean stop: `stop()` waits for the iteration
 * that is currently running (bounded by a timeout), so a shutdown never closes
 * the serial port in the middle of a write (review T12).
 */
class PollLoop {
    constructor(fn, intervalMs) {
        this.fn = fn;
        this.intervalMs = intervalMs;
        this.task = null;
        this.running = false;
    }
    start(delayMs = 0) {
        if (this.task)
            return;
        this.running = true;
        this.task = (async () => {
            if (delayMs > 0) {
                await sleep(delayMs);
            }
            while (this.running) {
                await this.fn();
                await sleep(this.intervalMs);
            }
        })();
    }
    /** Stop scheduling and wait for the in-flight iteration (bounded). */
    async stop(timeoutMs = 3000) {
        this.running = false;
        if (this.task) {
            await Promise.race([this.task, sleep(timeoutMs)]);
            this.task = null;
        }
    }
    get isRunning() {
        return this.running;
    }
}
exports.PollLoop = PollLoop;
//# sourceMappingURL=poll-loop.js.map