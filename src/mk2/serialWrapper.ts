import type SerialPort from "serialport";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Mk2Serial {
	port: SerialPort | undefined;
	portPath: string;
	log?: { debug: (...args: any[]) => void; info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void };

	constructor(portPath: string, log?: any) {
		this.portPath = portPath;
		this.log = log;
	}

	isOpen(): boolean {
		return this.port?.isOpen ?? false;
	}

	open(): Promise<void> {
		return new Promise(async (resolve, reject) => {
			// Load the native serialport binding only when a real port is opened.
			// This keeps unit tests independent of the native dependency.
			const mod: any = await import("serialport");
			const SerialPortImpl = mod.SerialPort ?? mod.default ?? mod;
			this.log?.debug?.("open: " + this.portPath);

			const onOpen = (err1: any): void => {
				if (err1) {
					reject(err1);
					return;
				}
				if (!this.port) {
					reject(new Error("serial port was not created"));
					return;
				}

				// MK2 needs DTR set to receive data (protocol §3.1).
				this.port.set({
					dtr: true,
					rts: false,
					cts: false,
					brk: false,
				});
				this.log?.debug?.("mk2-dtr: on");

				this.port.on("error", (err) => {
					this.log?.warn?.("serial port error: " + err);
				});
				this.port.on("close", () => {
					this.log?.info?.("serial port closed");
				});

				resolve();
			};

			try {
				// serialport 9.x: new SerialPort(path, options, callback)
				this.port = new SerialPortImpl(this.portPath, { baudRate: 2400 }, onOpen);
			} catch {
				// serialport 10+/12: new SerialPort({ path, baudRate }, callback)
				this.port = new SerialPortImpl({ path: this.portPath, baudRate: 2400 }, onOpen);
			}
		});
	}

	close(): Promise<void> {
		if (!this.port) {
			return Promise.resolve();
		}
		return new Promise((resolve, reject) => {
			this.port!.close((err) => {
				if (err) {
					reject(err);
					return;
				}
				resolve();
			});
		});
	}

	flush(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.port) {
				resolve();
				return;
			}
			this.port.flush((err) => {
				if (err) {
					reject(err);
					return;
				}
				resolve();
			});
		});
	}

	async flush_Workaround(): Promise<void> {
		// Discard bytes left in the receive buffer, but never loop forever if the
		// device keeps producing data.
		const deadline = Date.now() + 500;
		while (Date.now() < deadline) {
			const buf = this.port?.read(1);
			if (!buf) break;
			await sleep(5);
		}
	}

	write(buffer: Buffer): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.port || !this.isOpen()) {
				reject(new Error("serial port is not open"));
				return;
			}
			this.port.write(buffer, (err) => {
				if (err) {
					reject(err);
					return;
				}
				resolve();
			});
		});
	}

	read(size: number): Buffer | null {
		const result = this.port?.read(size);
		return result ? (result as Buffer) : null;
	}

	/** Read everything currently buffered (serialport read() without a size). */
	readAvailable(): Buffer | null {
		const result = this.port?.read();
		return result ? (result as Buffer) : null;
	}
}
