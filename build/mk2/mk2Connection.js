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
const errors_1 = require("../lib/errors");
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
        this.protocolErrors = 0;
        this.syncErrors = 0;
        this.lastError = "";
        /** Incremented on every successful sync, so clients can drop stale caches. */
        this.generation = 0;
        /**
         * Response budget per frame. Protocol §3.3 recommends 500 ms, but on a busy
         * host (ioBroker on a Raspberry Pi) 1500 ms has proven reliable; the F5
         * response gets its own longer budget either way.
         */
        this.responseTimeoutMs = 1500;
        /** Receive accumulator; bytes after a complete frame stay for the next read. */
        this.rxBuffer = Buffer.alloc(0);
        this.closedDown = false;
        /** Serialises every exchange; the tail continues even after a failure. */
        this.queueTail = Promise.resolve();
        this.portPath = portPath;
        this.log = log;
        this.debug = ((_a = this.log) === null || _a === void 0 ? void 0 : _a.level) == "debug";
        this.port = port !== null && port !== void 0 ? port : new serialWrapper_1.Mk2Serial(portPath, log);
        this.port.onError = (err) => this.handleSerialError(err);
    }
    async waitForFreeLine() {
        while (this.busy) {
            await sleep(30);
        }
    }
    /** Open the port and synchronise once; resynchronise after a reconnect. */
    async ensureSynced() {
        if (this.closedDown) {
            // After shutdown an in-flight iteration must not reopen the port (N3).
            throw new errors_1.Mk2TransportError("connection is shut down");
        }
        if (!this.port.isOpen()) {
            this.synced = false;
            await this.port.open();
        }
        if (!this.synced) {
            await this.sync();
        }
    }
    /** Permanently close the connection; a later ensureSynced() rejects. */
    async shutdown() {
        this.closedDown = true;
        this.synced = false;
        try {
            await this.port.close();
        }
        catch (_a) {
            // best effort
        }
    }
    /**
     * Synchronise on the MK2 version frame.
     *
     * When the port is opened in the middle of a transmission, the byte stream
     * does not start at a frame boundary. Instead of trusting the first length
     * byte (which used to produce a startup timeout on every adapter start), scan
     * the stream for a complete, checksum-valid version frame and keep the
     * remaining bytes for the next read.
     */
    async sync() {
        if (!this.port.isOpen()) {
            await this.port.open();
        }
        await this.discardInput();
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            // read() without a size returns everything buffered. A sized read would
            // return null until that many bytes are available, which would stall
            // the synchronisation forever on a 9-byte version frame.
            const chunk = this.port.readAvailable();
            if (chunk) {
                this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
            }
            if (this.extractVersionFrame()) {
                this.synced = true;
                this.generation++;
                this.log.debug("sync: version frame received");
                return;
            }
            await sleep(20);
        }
        this.synced = false;
        // A failed sync is a transport failure and must be visible in diag.* (N10).
        await this.fail("sync", "Sync - receive no version frame - no mk2 connected ?");
    }
    /** Find a complete, checksum-valid 'V' frame anywhere in the rx buffer. */
    extractVersionFrame() {
        const buf = this.rxBuffer;
        let incompleteAt = null;
        for (let i = 0; i + 2 < buf.length; i++) {
            if (buf[i + 1] !== 0xff || buf[i + 2] !== 0x56) {
                continue;
            }
            const len = buf[i] & 0x7f;
            if (len < 5) {
                continue;
            }
            const total = len + 2;
            if (i + total > buf.length) {
                // Incomplete candidate: remember it, but keep scanning - a complete
                // valid frame may already follow later in the buffer (review T10).
                if (incompleteAt === null) {
                    incompleteAt = i;
                }
                continue;
            }
            const frame = buf.slice(i, i + total);
            if (!this.checksum(frame)) {
                continue; // false positive inside other data, keep scanning
            }
            // 'V' <Version0..3> <Mode> (§3.4)
            this.mk2Version = (frame[3] | (frame[4] << 8) | (frame[5] << 16) | (frame[6] << 24)) >>> 0;
            this.mk2Mode = frame[7];
            this.rxBuffer = buf.slice(i + total);
            return true;
        }
        if (incompleteAt !== null) {
            // Keep an incomplete candidate for the next read; drop the rest.
            this.rxBuffer = buf.slice(incompleteAt);
        }
        else {
            // Keep a possible frame start (length + marker + command = 3 bytes),
            // not just two bytes - otherwise a split after the third byte loses
            // the length byte and the sync never succeeds (review N9).
            this.rxBuffer = buf.slice(Math.max(0, buf.length - 3));
        }
        return false;
    }
    /** Drop stale input, both in the driver buffer and in our own accumulator. */
    async discardInput() {
        this.rxBuffer = Buffer.alloc(0);
        await this.port.flush_Workaround();
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
        // A busy flag plus an await is not a mutex (review T13). Queue every
        // exchange on a promise tail instead: concurrent callers are strictly
        // serialised and a failure does not break the chain.
        const run = this.queueTail.then(() => this.performExchange(request, decode, options));
        this.queueTail = run.catch(() => undefined);
        return run;
    }
    async performExchange(request, decode, options = {}) {
        var _a;
        this.busy = true;
        let decoded = 0;
        try {
            await this.ensureSynced();
            await this.discardInput();
            this.frame_debug("SEND ->", request);
            await this.port.write(request);
            const deadline = Date.now() + Math.max(2000, 2 * this.responseTimeoutMs);
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
            await this.fail("timeout", "Timeout waiting for response from MK2");
            throw new Error("unreachable");
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
        while (Date.now() < deadline) {
            if (this.rxBuffer.length == 0) {
                const lengthByte = this.port.read(1);
                if (lengthByte) {
                    this.rxBuffer = Buffer.concat([this.rxBuffer, lengthByte]);
                }
                else {
                    await sleep(5);
                    continue;
                }
            }
            // Bit 7 of the length byte means an LED status frame is appended;
            // it must not be counted as part of the frame length.
            const len = this.rxBuffer[0] & 0x7F;
            const ledAppended = (this.rxBuffer[0] & 0x80) !== 0;
            if (len == 0) {
                await this.fail("protocol", "Invalid MK2 frame length 0");
            }
            // Length excludes the length and checksum bytes, so the complete
            // frame has len + 2 bytes (length + len + checksum).
            const needed = len + 2;
            while (this.rxBuffer.length < needed && Date.now() < deadline) {
                const chunk = this.port.read(needed - this.rxBuffer.length);
                if (chunk) {
                    this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
                }
                else {
                    await sleep(5);
                }
            }
            if (this.rxBuffer.length < needed) {
                await this.fail("timeout", "Timeout while receiving complete MK2 frame");
            }
            const frame = this.rxBuffer.slice(0, needed);
            if (!this.checksum(frame)) {
                await this.fail("checksum", "MK2 frame checksum error");
            }
            this.rxBuffer = this.rxBuffer.slice(needed);
            if (ledAppended) {
                // The appended LED block is not a response to the next command (N12).
                await this.discardAppendedLedStatus(deadline);
            }
            this.frame_debug("RECV <-", frame);
            // Bit 7 is LED-append framing metadata, not part of the protocol
            // length. Mask it before handing the frame to the decoders; the
            // checksum was already verified over the raw byte.
            frame[0] &= 0x7f;
            return frame;
        }
        await this.fail("timeout", "Timeout waiting for MK2 frame");
        throw new Error("unreachable");
    }
    /** Drop an appended 'L' <on> <blink> block after a frame with the LED bit. */
    async discardAppendedLedStatus(deadline) {
        // Use a small independent grace window: the frame may have arrived late,
        // so the caller's deadline can already be exhausted.
        const graceEnd = Math.min(deadline, Date.now() + 100);
        while (this.rxBuffer.length < 4 && Date.now() < graceEnd) {
            const chunk = this.port.read(4 - this.rxBuffer.length);
            if (chunk) {
                this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
            }
            else {
                await sleep(5);
            }
        }
        if (this.rxBuffer.length >= 3 && this.rxBuffer[0] == 0x4c) {
            // Older firmware appends a trailing 0x00 that would otherwise be
            // read as the next frame length (0 -> protocol error).
            const consume = this.rxBuffer.length >= 4 && this.rxBuffer[3] == 0x00 ? 4 : 3;
            this.log.debug("discarding appended LED status frame");
            this.rxBuffer = this.rxBuffer.slice(consume);
        }
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
        if (kind == "protocol")
            this.protocolErrors++;
        if (kind == "sync")
            this.syncErrors++;
        this.lastError = message;
        this.synced = false;
        this.rxBuffer = Buffer.alloc(0);
        try {
            await this.port.close();
        }
        catch (_a) {
            // best effort; the reopen path handles a closed or broken port
        }
        throw new errors_1.Mk2TransportError(message);
    }
    /**
     * Asynchronous serial errors (USB unplugged, driver reset) must not only be
     * logged: invalidate the sync and close the port so the next poll reopens and
     * resynchronises (issue #8).
     */
    handleSerialError(err) {
        this.protocolErrors++;
        this.lastError = "serial error: " + err.message;
        this.synced = false;
        this.rxBuffer = Buffer.alloc(0);
        void this.port.close().catch(() => undefined);
    }
    /** Set of exchange queue: serialises requests; see communicateMulti. */
    async waitForIdle(timeoutMs = 3000) {
        await Promise.race([this.queueTail, sleep(timeoutMs)]);
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