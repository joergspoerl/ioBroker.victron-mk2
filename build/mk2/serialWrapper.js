"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mk2Serial = void 0;
const serialport_1 = __importDefault(require("serialport"));
class Mk2Serial {
    open() {
        return new Promise((resolve, reject) => {
            this.port = new serialport_1.default("");
            this.port.open((err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
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