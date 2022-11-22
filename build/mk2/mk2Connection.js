"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mk2Connection = exports.mk2SpezialFrame = void 0;
const serialWrapper_1 = require("./serialWrapper");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const util = require("util");
// helper function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
var mk2SpezialFrame;
(function (mk2SpezialFrame) {
    mk2SpezialFrame[mk2SpezialFrame["normal"] = 255] = "normal";
    mk2SpezialFrame[mk2SpezialFrame["infox20"] = 32] = "infox20";
    mk2SpezialFrame[mk2SpezialFrame["infox21"] = 33] = "infox21";
    mk2SpezialFrame[mk2SpezialFrame["masterMultiLed"] = 65] = "masterMultiLed";
    mk2SpezialFrame[mk2SpezialFrame["ramReadOk"] = 133] = "ramReadOk";
})(mk2SpezialFrame = exports.mk2SpezialFrame || (exports.mk2SpezialFrame = {}));
class Mk2Connection {
    constructor(portPath, log) {
        this.debug = false;
        this.busy = false;
        this.portPath = portPath;
        this.port = new serialWrapper_1.Mk2Serial(portPath);
        this.log = log;
        if (this.log && this.log.level == "debug") {
            this.debug = true;
        }
    }
    async waitForFreeLine() {
        if (this.debug)
            this.log.debug("waitForFreeLine start");
        while (this.busy) {
            await sleep(100);
        }
        if (this.debug)
            this.log.debug("waitForFreeLine end");
    }
    async communicate(request, decode) {
        var _a;
        await this.waitForFreeLine();
        this.busy = true;
        try {
            if (!((_a = this.port.port) === null || _a === void 0 ? void 0 : _a.isOpen)) {
                await this.port.open();
            }
            // await this.port.flush() // is not working ??
            // clear recive buffer workaround
            await this.port.flush_Workaround();
            this.frame_debug("SEND ->", request);
            await this.port.write(request);
            await sleep(30);
            let i = 0;
            while (true) {
                i++;
                const frame = await this.receiveFrame();
                this.busy = false;
                const spezial = frame[1];
                const frameType = frame[2];
                if (spezial == mk2SpezialFrame.normal && frameType == 0x56) {
                    this.log.debug("VERSION FRAME -> " + frame);
                    if (i > 1) {
                        // await this.port.close()
                        throw ("Out of sync !");
                    }
                }
                else {
                    if ((spezial == mk2SpezialFrame.normal
                        || spezial == mk2SpezialFrame.infox20
                        || spezial == mk2SpezialFrame.infox21
                        || spezial == mk2SpezialFrame.masterMultiLed
                        || spezial == mk2SpezialFrame.ramReadOk)) {
                        await decode(frame);
                        break;
                    }
                }
            }
        }
        catch (ex) {
            this.log.error("communicate: " + JSON.stringify(ex));
        }
        this.busy = false;
    }
    async receiveFrame() {
        let frame;
        while (true) {
            const lengthByte = this.port.read(1);
            // this.log.debug(a)
            if (lengthByte != null) {
                // this.log.debug("length", lengthByte[0])
                await sleep(100);
                const frameData = this.port.read(lengthByte[0] + 1);
                if (frameData) {
                    frame = Buffer.concat([lengthByte, frameData]);
                    this.frame_debug("RECV <-", frame);
                    break;
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
        var _a, _b;
        this.log.debug("start sync: ");
        if (!((_a = this.port.port) === null || _a === void 0 ? void 0 : _a.isOpen)) {
            await this.port.open();
        }
        let buffer;
        let counter = 0;
        await this.port.flush_Workaround();
        while (true) {
            counter++;
            buffer = this.port.read(1);
            // console.log("sync 1", buffer)
            // this.log.debug(f)
            if (buffer && buffer[0] == 0xFF) {
                await sleep(50);
                buffer = (_b = this.port.port) === null || _b === void 0 ? void 0 : _b.read(6);
                // console.log("sync 2", buffer)
                break;
            }
            await sleep(10);
            if (counter > 5000)
                throw ("Sync - receive no version frame - no mk2 connected ?");
        }
        this.log.debug("sync: ");
    }
    frame_debug(txt, frame, data) {
        if (this.debug) {
            this.log.debug("-------------------------------------------------------------------------------------");
            this.log.debug(txt + util.inspect(frame));
            let legend = "       ";
            for (let i = 0; i < frame.length; i++) {
                legend += i.toString().padStart(3, " ");
            }
            this.log.debug(txt + legend);
            if (data)
                this.log.debug(data);
            this.log.debug("-------------------------------------------------------------------------------------");
        }
    }
}
exports.Mk2Connection = Mk2Connection;
//# sourceMappingURL=mk2Connection.js.map