import SerialPort from "serialport";

export  class Mk2Serial {
	port: SerialPort | undefined
	open() : Promise<void> {
		return new Promise((resolve, reject) => {
			this.port = new SerialPort("")
			this.port.open((err)=>{
				if (err) {
					reject(err)
				}
				resolve()
			})
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