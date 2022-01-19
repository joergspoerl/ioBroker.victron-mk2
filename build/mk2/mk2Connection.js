"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mk2Connection = void 0;
const serialWrapper_1 = require("./serialWrapper");
// helper function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
class Mk2Connection {
    constructor(portPath) {
        this.debug = true;
        this.busy = false;
        this.portPath = portPath;
        this.port = new serialWrapper_1.Mk2Serial(portPath);
    }
    async waitForFreeLine() {
        console.log("waitForFreeLine start");
        while (this.busy) {
            await sleep(100);
        }
        console.log("waitForFreeLine end");
    }
    async communicate(request, decode) {
        var _a;
        await this.waitForFreeLine();
        this.busy = true;
        try {
            if (!((_a = this.port.port) === null || _a === void 0 ? void 0 : _a.isOpen)) {
                await this.port.open();
            }
            // await this.sync() // for syncing recive version frame
            this.frame_debug("SEND ->", request);
            await this.port.write(request);
            let i = 0;
            while (true) {
                i++;
                const frame = await this.receiveFrame();
                this.busy = false;
                if (frame[1] != 255 || frame[2] != 86) {
                    await decode(frame);
                    break;
                }
                else {
                    console.log("VERSION FRAME", frame);
                    if (i > 1) {
                        // await this.port.close()
                        throw ("Out of sync !");
                    }
                }
            }
        }
        catch (Exception) {
            console.log("communicate: ", Exception);
        }
        this.busy = false;
        // await this.port.close()
    }
    async receiveFrame() {
        let frame;
        while (true) {
            const lengthByte = this.port.read(1);
            // console.log(a)
            if (lengthByte != null) {
                console.log();
                console.log("length", lengthByte[0]);
                await sleep(100);
                const frameData = this.port.read(lengthByte[0] + 1);
                if (frameData) {
                    frame = Buffer.concat([lengthByte, frameData]);
                    if (frame && frame.length >= 1 && (frame[1] == 0xFF || frame[1] == 0x20)) {
                        this.frame_debug("RECV <-", frame);
                        break;
                    }
                    console.log(frame);
                }
                else {
                    throw ("Frame error");
                }
            }
            await sleep(10);
        }
        return frame;
    }
    async sync() {
        console.log("start sync: ");
        let f;
        await this.port.flush();
        while (true) {
            f = this.port.read(1);
            // console.log(f)
            if (f && f[0] == 0xFF) {
                await sleep(100);
                f = this.port.read(7);
                // console.log(f)
                break;
            }
            await sleep(10);
        }
        console.log("sync: ");
    }
    frame_debug(txt, frame, data) {
        if (this.debug) {
            console.log("-------------------------------------------------------------------------------------");
            console.log(txt, frame);
            let legend = "       ";
            for (let i = 0; i < frame.length; i++) {
                legend += i.toString().padStart(3, " ");
            }
            console.log(txt, legend);
            if (data)
                console.log(data);
            console.log("-------------------------------------------------------------------------------------");
        }
    }
}
exports.Mk2Connection = Mk2Connection;
//# sourceMappingURL=mk2Connection.js.map