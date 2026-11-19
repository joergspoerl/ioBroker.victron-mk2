"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollLoop = void 0;
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
        this.timer = null;
        this.wakeUp = null;
    }
    start(delayMs = 0) {
        if (this.task)
            return;
        this.running = true;
        this.task = (async () => {
            if (delayMs > 0) {
                await this.delay(delayMs);
            }
            while (this.running) {
                await this.fn();
                if (!this.running) {
                    break;
                }
                await this.delay(this.intervalMs);
            }
        })();
    }
    /** Stop scheduling and wait for the in-flight iteration (bounded). */
    async stop(timeoutMs = 3000) {
        this.running = false;
        // Wake a pending delay immediately so shutdown does not wait for the
        // whole poll interval (which can be hours).
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.wakeUp) {
            this.wakeUp();
            this.wakeUp = null;
        }
        if (this.task) {
            let timeoutTimer;
            const timeout = new Promise((resolve) => {
                timeoutTimer = setTimeout(resolve, timeoutMs);
            });
            await Promise.race([this.task, timeout]);
            if (timeoutTimer) {
                clearTimeout(timeoutTimer);
            }
            this.task = null;
        }
    }
    get isRunning() {
        return this.running;
    }
    delay(ms) {
        return new Promise((resolve) => {
            this.wakeUp = resolve;
            this.timer = setTimeout(() => {
                this.timer = null;
                this.wakeUp = null;
                resolve();
            }, ms);
        });
    }
}
exports.PollLoop = PollLoop;
//# sourceMappingURL=poll-loop.js.map