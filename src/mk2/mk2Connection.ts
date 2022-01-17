import { Mk2Serial } from "./serialWrapper";

// helper function
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export class Mk2Connection {

	portPath: string
	port: Mk2Serial
	debug = true
	constructor (portPath: string) {
		this.portPath = portPath
		this.port = new Mk2Serial(portPath)
	}

	async communicate(request: Buffer, decode: (response: Buffer)=>Promise<void>): Promise<void> {

		try {
			await this.port.open()

			await this.sync() // for syncing recive version frame

			this.frame_debug("SEND ->", request)
			await this.port.write(request)

			let i = 0
			while (true) {
				i++
				const frame: Buffer = await this.receiveFrame()
				if (frame[1] != 255 || frame[2] != 86) {
					decode(frame)
					break
				} else {
					console.log("VERSION FRAME", frame)
					if (i > 5) {
						throw("Out of sync !")
					}
				}
			}

			await this.port.close()

		} catch (Exception) {
			console.log("communicate: ", Exception)
		}

	}

	async receiveFrame () : Promise<Buffer> {
		let frame
		while (true) {
			const lengthByte = this.port.read(1)
			// console.log(a)
			if (lengthByte != null) {
				console.log()
				console.log("length", lengthByte[0])
				await sleep(100)
				const frameData = this.port.read(lengthByte[0] + 1)
				if (frameData) {
					frame = Buffer.concat([lengthByte, frameData])
					if (frame && frame.length >= 1 && (frame[1] == 0xFF || frame[1] == 0x20)) {
						this.frame_debug("RECV <-", frame);
						break
					}
					console.log(frame)
				} else {
					throw("Frame error")
				}
			}
			await sleep(10)

		}
		return frame
	}


	async sync (): Promise<void> {
		console.log("start sync: ")
		let f
		await this.port.flush()
		while (true) {
			f = this.port.read(1)
			// console.log(f)

			if (f && f[0] == 0xFF) {
				await sleep(100)
				f = this.port.read(7)
				// console.log(f)
				break
			}
			await sleep(10)

		}
		console.log("sync: ")

	}





	frame_debug(txt: string, frame: Buffer, data? : any): void {
		if (this.debug) {
			console.log("-------------------------------------------------------------------------------------")
			console.log(txt, frame);
			let legend = "       ";
			for (let i = 0; i < frame.length; i++) {
				legend += i.toString().padStart(3, " ")
			}
			console.log(txt, legend)
			if (data) console.log(data)
			console.log("-------------------------------------------------------------------------------------")
		}
	}

}