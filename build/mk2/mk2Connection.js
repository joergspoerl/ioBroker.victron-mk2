"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mk2Connection = exports.mk2SpezialFrame = void 0;
const serialWrapper_1 = require("./serialWrapper");
const util = __importStar(require("util"));
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
var mk2SpezialFrame;
(function (mk2SpezialFrame) {
    mk2SpezialFrame[mk2SpezialFrame["normal"] = 255] = "normal";
    mk2SpezialFrame[mk2SpezialFrame["infox20"] = 32] = "infox20";
    mk2SpezialFrame[mk2SpezialFrame["infox21"] = 33] = "infox21";
    mk2SpezialFrame[mk2SpezialFrame["masterMultiLed"] = 65] = "masterMultiLed";
    mk2SpezialFrame[mk2SpezialFrame["ramReadOk"] = 133] = "ramReadOk";
})(mk2SpezialFrame || (exports.mk2SpezialFrame = mk2SpezialFrame = {}));
/**
 * Robust MK2 serial connection.
 *
 * The previous implementation relied on fixed sleeps and unbounded reads. This
 * version reads length-prefixed frames, validates checksums, applies timeouts
 * and propagates communication errors to the caller instead of silently
 * swallowing them.
 */
class Mk2Connection {
    constructor(portPath, log, port) {
        var _a;
        this.debug = false;
        this.busy = false;
        this.synced = false;
        /** MK2 firmware version and mode byte from the last version frame (§3.4). */
        this.mk2Version = null;
        this.mk2Mode = null;
        /** Diagnostics (issue #8), counted since the adapter started. */
        this.timeouts = 0;
        this.checksumErrors = 0;
        this.lastError = "";
        /**
         * Response budget per frame. Protocol §3.3 recommends 500 ms, but on a busy
         * host (ioBroker on a Raspberry Pi) 1500 ms has proven reliable; the F5
         * response gets its own longer budget either way.
         */
        this.responseTimeoutMs = 1500;
        this.portPath = portPath;
        this.log = log;
        this.debug = ((_a = this.log) === null || _a === void 0 ? void 0 : _a.level) == "debug";
        this.port = port !== null && port !== void 0 ? port : new serialWrapper_1.Mk2Serial(portPath, log);
    }
    async waitForFreeLine() {
        while (this.busy) {
            await sleep(30);
        }
    }
    /** Open the port and synchronise once; resynchronise after a reconnect. */
    async ensureSynced() {
        if (!this.port.isOpen()) {
            this.synced = false;
            await this.port.open();
        }
        if (!this.synced) {
            await this.sync();
        }
    }
    async sync() {
        if (!this.port.isOpen()) {
            await this.port.open();
        }
        await this.port.flush_Workaround();
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const frame = await this.receiveFrame(1000);
            if (frame[1] == mk2SpezialFrame.normal && frame[2] == 0x56) {
                // 'V' <Version0..3> <Mode>; the mode byte also tells VE 9-bit from
                // VE.Bus and carries the current address (§3.4).
                if (frame.length >= 8) {
                    this.mk2Version = (frame[3] | (frame[4] << 8) | (frame[5] << 16) | (frame[6] << 24)) >>> 0;
                    this.mk2Mode = frame[7];
                }
                this.synced = true;
                this.log.debug("sync: version frame received");
                return;
            }
        }
        this.synced = false;
        throw new Error("Sync - receive no version frame - no mk2 connected ?");
    }
    /**
     * Send a request and decode one valid response frame.
     *
     * Version frames and unknown frames are ignored until the response or a
     * timeout arrives. Errors (timeout, checksum, decode) are propagated to the
     * caller so that failed writes never look successful.
     */
    async communicate(request, decode, options = {}) {
        return this.communicateMulti(request, async (response) => {
            await decode(response);
            return true;
        }, options);
    }
    /**
     * Send a request and decode as many response frames as the device sends.
     *
     * The MK2 packs up to three 3-byte Winmon frames into one MK2 frame, so a
     * command like CommandGetSettingInfo (five responses) arrives as several MK2
     * frames. `decode` returns true once the answer is complete. With
     * `allowQuietEnd` a read timeout after at least one decoded frame ends the
     * exchange instead of failing, because older firmware legitimately sends
     * fewer responses than the current protocol describes.
     */
    async communicateMulti(request, decode, options = {}) {
        var _a;
        await this.waitForFreeLine();
        this.busy = true;
        let decoded = 0;
        try {
            await this.ensureSynced();
            await this.port.flush_Workaround();
            this.frame_debug("SEND ->", request);
            await this.port.write(request);
            const deadline = Date.now() + 2000;
            while (Date.now() < deadline) {
                let frame;
                try {
                    frame = await this.receiveFrame((_a = options.readTimeoutMs) !== null && _a !== void 0 ? _a : this.responseTimeoutMs);
                }
                catch (error) {
                    if (options.allowQuietEnd && decoded > 0) {
                        this.log.debug("communicateMulti: quiet end after " + decoded + " frame(s)");
                        return;
                    }
                    throw error;
                }
                const spezial = frame[1];
                const frameType = frame[2];
                // The MK2 may send a version frame while responding; it is not a
                // protocol error and must not abort the whole poll.
                if (spezial == mk2SpezialFrame.normal && frameType == 0x56) {
                    this.log.debug("VERSION FRAME ignored while waiting for response");
                    continue;
                }
                if (spezial == mk2SpezialFrame.normal ||
                    spezial == mk2SpezialFrame.infox20 ||
                    spezial == mk2SpezialFrame.infox21 ||
                    spezial == mk2SpezialFrame.masterMultiLed ||
                    spezial == mk2SpezialFrame.ramReadOk) {
                    decoded++;
                    if (await decode(frame)) {
                        return;
                    }
                }
            }
            throw new Error("Timeout waiting for response from MK2");
        }
        finally {
            this.busy = false;
        }
    }
    /**
     * Read one complete length-prefixed frame, with timeout and checksum
     * validation. Partial reads are accumulated until the whole frame arrived.
     * The default follows the configured response budget (protocol §3.3 names
     * 500 ms; a busy host may need more). F5 gets a longer budget either way.
     */
    async receiveFrame(timeoutMs = this.responseTimeoutMs) {
        const deadline = Date.now() + timeoutMs;
        let buf = Buffer.alloc(0);
        while (Date.now() < deadline) {
            if (buf.length == 0) {
                const lengthByte = this.port.read(1);
                if (lengthByte) {
                    buf = Buffer.concat([buf, lengthByte]);
                }
                else {
                    await sleep(5);
                    continue;
                }
            }
            // Bit 7 of the length byte means an LED status frame is appended;
            // it must not be counted as part of the frame length.
            const len = buf[0] & 0x7F;
            if (len == 0) {
                await this.fail("protocol", "Invalid MK2 frame length 0");
            }
            // Length excludes the length and checksum bytes, so the complete
            // frame has len + 2 bytes (length + len + checksum).
            const needed = len + 2;
            while (buf.length < needed && Date.now() < deadline) {
                const chunk = this.port.read(needed - buf.length);
                if (chunk) {
                    buf = Buffer.concat([buf, chunk]);
                }
                else {
                    await sleep(5);
                }
            }
            if (buf.length < needed) {
                await this.fail("timeout", "Timeout while receiving complete MK2 frame");
            }
            const frame = buf.slice(0, needed);
            if (!this.checksum(frame)) {
                await this.fail("checksum", "MK2 frame checksum error");
            }
            this.frame_debug("RECV <-", frame);
            return frame;
        }
        await this.fail("timeout", "Timeout waiting for MK2 frame");
        throw new Error("unreachable");
    }
    /**
     * Count the failure and invalidate the connection. A timeout or checksum
     * error means the byte stream cannot be trusted any more, so the port is
     * closed and the next poll reopens and resynchronises (issue #8).
     */
    async fail(kind, message) {
        if (kind == "timeout")
            this.timeouts++;
        if (kind == "checksum")
            this.checksumErrors++;
        this.lastError = message;
        this.synced = false;
        try {
            await this.port.close();
        }
        catch (_a) {
            // best effort; the reopen path handles a closed or broken port
        }
        throw new Error(message);
    }
    checksum(frame) {
        let sum = 0;
        for (let i = 0; i < frame.length; i++) {
            sum += frame[i];
        }
        return sum % 256 == 0;
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