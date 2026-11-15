function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The adapter's poll loop with a clean stop: `stop()` waits for the iteration
 * that is currently running (bounded by a timeout), so a shutdown never closes
 * the serial port in the middle of a write (review T12).
 */
export class PollLoop {
	private task: Promise<void> | null = null;
	private running = false;

	constructor(
		private readonly fn: () => Promise<void>,
		private readonly intervalMs: number,
	) {}

	start(delayMs = 0): void {
		if (this.task) return;
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
	async stop(timeoutMs = 3000): Promise<void> {
		this.running = false;
		if (this.task) {
			await Promise.race([this.task, sleep(timeoutMs)]);
			this.task = null;
		}
	}

	get isRunning(): boolean {
		return this.running;
	}
}
