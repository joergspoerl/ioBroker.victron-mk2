import { Mk2Serial } from "./serialWrapper";

// helper function
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export enum mk2SpezialFrame {
	normal = 0xFF,
	info = 0x21,
	masterMultiLed = 0x41
}

export class Mk2Connection {

	portPath: string
	port: Mk2Serial
	debug = true
	busy = false
	constructor (portPath: string) {
		this.portPath = portPath
		this.port = new Mk2Serial(portPath)
	}

	async waitForFreeLine (): Promise<void> {
		console.log("waitForFreeLine start")
		while (this.busy) {
			await sleep(100)
		}
		console.log("waitForFreeLine end")
	}
	async communicate(request: Buffer, decode: (response: Buffer)=>Promise<void>): Promise<void> {

		await this.waitForFreeLine()
		this.busy = true

		try {
			if (!this.port.port?.isOpen) {
				await this.port.open()
			}

			await this.sync() // for syncing recive version frame

			this.frame_debug("SEND ->", request)
			await this.port.write(request)

			let i = 0
			while (true) {
				i++
				const frame: Buffer = await this.receiveFrame()
				this.busy = false
				const spezial = frame[1] as number
				const frameType = frame[2] as number
				if (spezial == mk2SpezialFrame.normal && frameType == 0x56) {
					console.log("VERSION FRAME", frame)
					if (i > 1) {
						// await this.port.close()
						throw("Out of sync !")
					}
				} else {
					if ((  spezial == mk2SpezialFrame.normal
						|| spezial == mk2SpezialFrame.info
						|| spezial == mk2SpezialFrame.masterMultiLed)) {
						await decode(frame)
						break
					}
				}
			}


		} catch (Exception) {
			console.log("communicate: ", Exception)
		}
		this.busy = false
		// await this.port.close()

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
					this.frame_debug("RECV <-", frame);
					break
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