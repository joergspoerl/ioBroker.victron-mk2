import SerialPort from "serialport";

export default class serial {
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

}