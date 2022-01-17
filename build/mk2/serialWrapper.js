"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mk2Serial = void 0;
const serialport_1 = __importDefault(require("serialport"));
class Mk2Serial {
    constructor(portPath) {
        this.portPath = portPath;
    }
    open() {
        return new Promise((resolve, reject) => {
            console.log("open:", this.portPath);
            this.port = new serialport_1.default(this.portPath, {
                baudRate: 2400,
            }, (err1) => {
                if (err1) {
                    reject(err1);
                }
                if (this.port) {
                    console.log("mk2-dtr: on");
                    // activate interface
                    this.port.set({
                        "dtr": true,
                        "rts": false,
                        "cts": false,
                        //						"dts": false,
                        "brk": false,
                    });
                    resolve();
                }
            });
        });
    }
    close() {
        return new Promise((resolve, reject) => {
            if (this.port) {
                this.port.close((err) => {
                    if (err) {
                        reject(err);
                    }
                    resolve();
                });
            }
        });
    }
    flush() {
        return new Promise((resolve, reject) => {
            var _a;
            (_a = this.port) === null || _a === void 0 ? void 0 : _a.flush((err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        });
    }
    write(buffer) {
        return new Promise((resolve, reject) => {
            var _a;
            (_a = this.port) === null || _a === void 0 ? void 0 : _a.write(buffer, (err) => {
                if (err) {
                    reject(err);
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
}
exports.Mk2Serial = Mk2Serial;
//# sourceMappingURL=serialWrapper.js.map