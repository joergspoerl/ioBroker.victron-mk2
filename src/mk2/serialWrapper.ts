import SerialPort from "serialport";

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export  class Mk2Serial {
	port: SerialPort | undefined

	portPath: string
	constructor (portPath: string) {
		this.portPath = portPath
	}
	open() : Promise<void> {
		return new Promise((resolve, reject) => {
			console.log("open:", this.portPath)
			this.port = new SerialPort(this.portPath, {
				baudRate: 2400,
			}, (err1) => {
				if (err1) {
					reject(err1)
				}

				if (this.port) {

					console.log("mk2-dtr: on");
					// activate interface
					this.port.set({
						"dtr": true,
						"rts": false,
						"cts": false,
						//						"dts": false,
						"brk": false,
					})

					resolve()
				}

			})
		})
	}


	close() : Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.port) {
				this.port.close((err)=>{
					if (err) {
						reject(err)
					}
					resolve()
				})
			}
		})
	}

	flush() : Promise<void> {
		return new Promise((resolve, reject) => {
			this.port?.flush((err)=>{
				if (err) {
					reject(err)
				}
				resolve()
			})
		})
	}

	async flush_Workaround() : Promise<void> {

		let buf
		while(true) {
			buf = this.port?.read(1)
			// console.log("post send", buf)
			if (!buf) break
			await sleep(10)
		}
	}

	write(buffer: Buffer) : Promise<void> {
		return new Promise((resolve, reject) => {
			this.port?.write(buffer, (err)=>{
				if (err) {
					reject(err)
				}
				resolve()
			})
		})
	}

	read(size: number) : Buffer | null  {
		const result = this.port?.read(size)
		return result ? result as Buffer : null
	}

}