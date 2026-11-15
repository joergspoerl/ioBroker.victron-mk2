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
exports.Mk2Serial = void 0;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
class Mk2Serial {
    constructor(portPath, log) {
        this.portPath = portPath;
        this.log = log;
    }
    isOpen() {
        var _a, _b;
        return (_b = (_a = this.port) === null || _a === void 0 ? void 0 : _a.isOpen) !== null && _b !== void 0 ? _b : false;
    }
    async open() {
        var _a, _b, _c, _d;
        // Load the native serialport binding only when a real port is opened.
        // This keeps unit tests independent of the native dependency.
        // The import must be awaited *outside* the Promise executor: a rejection
        // inside an async executor would leave open() pending forever (review T3).
        const mod = await Promise.resolve().then(() => __importStar(require("serialport")));
        const SerialPortImpl = (_b = (_a = mod.SerialPort) !== null && _a !== void 0 ? _a : mod.default) !== null && _b !== void 0 ? _b : mod;
        (_d = (_c = this.log) === null || _c === void 0 ? void 0 : _c.debug) === null || _d === void 0 ? void 0 : _d.call(_c, "open: " + this.portPath);
        await new Promise((resolve, reject) => {
            const onOpen = (err1) => {
                var _a, _b;
                if (err1) {
                    reject(err1);
                    return;
                }
                if (!this.port) {
                    reject(new Error("serial port was not created"));
                    return;
                }
                // MK2 needs DTR set to receive data (protocol §3.1).
                this.port.set({
                    dtr: true,
                    rts: false,
                    cts: false,
                    brk: false,
                });
                (_b = (_a = this.log) === null || _a === void 0 ? void 0 : _a.debug) === null || _b === void 0 ? void 0 : _b.call(_a, "mk2-dtr: on");
                this.port.on("error", (err) => {
                    var _a, _b;
                    (_b = (_a = this.log) === null || _a === void 0 ? void 0 : _a.warn) === null || _b === void 0 ? void 0 : _b.call(_a, "serial port error: " + err);
                });
                this.port.on("close", () => {
                    var _a, _b;
                    (_b = (_a = this.log) === null || _a === void 0 ? void 0 : _a.info) === null || _b === void 0 ? void 0 : _b.call(_a, "serial port closed");
                });
                resolve();
            };
            try {
                // serialport 9.x: new SerialPort(path, options, callback)
                this.port = new SerialPortImpl(this.portPath, { baudRate: 2400 }, onOpen);
            }
            catch (_a) {
                // serialport 10+/12: new SerialPort({ path, baudRate }, callback)
                this.port = new SerialPortImpl({ path: this.portPath, baudRate: 2400 }, onOpen);
            }
        });
    }
    close() {
        if (!this.port) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            this.port.close((err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }
    flush() {
        return new Promise((resolve, reject) => {
            if (!this.port) {
                resolve();
                return;
            }
            this.port.flush((err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }
    async flush_Workaround() {
        var _a;
        // Discard bytes left in the receive buffer, but never loop forever if the
        // device keeps producing data.
        const deadline = Date.now() + 500;
        while (Date.now() < deadline) {
            const buf = (_a = this.port) === null || _a === void 0 ? void 0 : _a.read(1);
            if (!buf)
                break;
            await sleep(5);
        }
    }
    write(buffer) {
        return new Promise((resolve, reject) => {
            if (!this.port || !this.isOpen()) {
                reject(new Error("serial port is not open"));
                return;
            }
            this.port.write(buffer, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }
    read(size) {
        var _a;
        const result = (_a = this.port) === null || _a === void 0 ? void 0 : _a.read(size);
        return result ? result : null;
    }
    /** Read everything currently buffered (serialport read() without a size). */
    readAvailable() {
        var _a;
        const result = (_a = this.port) === null || _a === void 0 ? void 0 : _a.read();
        return result ? result : null;
    }
}
exports.Mk2Serial = Mk2Serial;
//# sourceMappingURL=serialWrapper.js.map