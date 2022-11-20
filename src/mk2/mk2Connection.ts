import { Mk2Serial } from "./serialWrapper";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const util = require('util')
// helper function
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export enum mk2SpezialFrame {
	normal = 0xFF,
	infox20 = 0x20,
	infox21 = 0x21,
	masterMultiLed = 0x41,
	ramReadOk = 0x85
}

export class Mk2Connection {

	portPath: string
	port: Mk2Serial
	debug = false
	busy = false
	log: ioBroker.Logger
	constructor (portPath: string, log: ioBroker.Logger) {
		this.portPath = portPath
		this.port = new Mk2Serial(portPath)
		this.log = log
	}

	async waitForFreeLine (): Promise<void> {
		if (this.debug) this.log.debug("waitForFreeLine start")
		while (this.busy) {
			await sleep(100)
		}
		if (this.debug) this.log.debug("waitForFreeLine end")
	}
	async communicate(request: Buffer, decode: (response: Buffer)=>Promise<void>): Promise<void> {

		await this.waitForFreeLine()
		this.busy = true

		try {
			if (!this.port.port?.isOpen) {
				await this.port.open()
			}

			// await this.port.flush() // is not working ??

			// clear recive buffer workaround
			await this.port.flush_Workaround()

			this.frame_debug("SEND ->", request)
			await this.port.write(request)

			await sleep(30)

			let i = 0
			while (true) {
				i++
				const frame: Buffer = await this.receiveFrame()
				this.busy = false
				const spezial = frame[1] as number
				const frameType = frame[2] as number
				if (spezial == mk2SpezialFrame.normal && frameType == 0x56) {
					this.log.debug("VERSION FRAME -> " + frame)
					if (i > 1) {
						// await this.port.close()
						throw("Out of sync !")
					}
				} else {
					if ((  spezial == mk2SpezialFrame.normal
						|| spezial == mk2SpezialFrame.infox20
						|| spezial == mk2SpezialFrame.infox21
						|| spezial == mk2SpezialFrame.masterMultiLed
						|| spezial == mk2SpezialFrame.ramReadOk)) {
						await decode(frame)
						break
					}
				}
			}


		} catch (ex:any) {
			this.log.error("communicate: exception")
			this.log.error(ex.toString())
		}
		this.busy = false
		// await this.port.close()

	}

	async receiveFrame () : Promise<Buffer> {
		let frame
		while (true) {
			const lengthByte = this.port.read(1)
			// this.log.debug(a)
			if (lengthByte != null) {
				// this.log.debug("length", lengthByte[0])
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
		this.log.debug("start sync: ")

		if (!this.port.port?.isOpen) {
			await this.port.open()
		}

		let buffer
		let counter = 0
		await this.port.flush_Workaround()

		while (true) {
			counter++
			buffer = this.port.read(1)
			// console.log("sync 1", buffer)
			// this.log.debug(f)

			if (buffer && buffer[0] == 0xFF) {
				await sleep(50)
				buffer = this.port.port?.read(6)
				// console.log("sync 2", buffer)

				break
			}
			await sleep(10)
			if (counter > 5000) throw ("Sync - receive no version frame - no mk2 connected ?")

		}
		this.log.debug("sync: ")

	}






	frame_debug(txt: string, frame: Buffer, data? : any): void {
		if (this.debug) {
			this.log.debug("-------------------------------------------------------------------------------------")
			this.log.debug(txt +  util.inspect(frame));
			let legend = "       ";
			for (let i = 0; i < frame.length; i++) {
				legend += i.toString().padStart(3, " ")
			}
			this.log.debug(txt + legend)
			if (data) this.log.debug(data)
			this.log.debug("-------------------------------------------------------------------------------------")
		}
	}

}