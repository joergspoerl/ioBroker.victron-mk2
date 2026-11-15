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
exports.splitIdFromAdapter = splitIdFromAdapter;
const utils = __importStar(require("@iobroker/adapter-core"));
const mk2Protocol_1 = require("./mk2/mk2Protocol");
const state_gate_1 = require("./lib/state-gate");
const control_rules_1 = require("./lib/control-rules");
const send_queue_1 = require("./lib/send-queue");
const state_objects_1 = require("./lib/state-objects");
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function splitIdFromAdapter(str) {
    const delimiter = ".";
    const start = 2;
    const tokens = str.split(delimiter).slice(start);
    return tokens.join(delimiter);
}
class VictronMk2 extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: "victron-mk2",
        });
        this.mainLoopRunning = true;
        this.toSendQueue = [];
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    async onReady() {
        const interval = Number(this.config.interval);
        this.config.interval = Number.isFinite(interval) && interval >= 1 ? interval : 2;
        if (!this.config.portPath) {
            this.log.error("config portPath is empty; adapter will not poll until it is configured");
            return;
        }
        this.log.info("config interval: " + this.config.interval);
        this.log.info("config portPath: " + this.config.portPath);
        this.mk2 = new mk2Protocol_1.Mk2Protocol(this.config.portPath, this.log);
        await this.initObjects();
        this.mainLoop();
        this.subscribeStates("control.*");
    }
    async onUnload(callback) {
        var _a;
        this.mainLoopRunning = false;
        try {
            await ((_a = this.mk2) === null || _a === void 0 ? void 0 : _a.conn.port.close());
        }
        catch (_b) {
            // ignore close errors during shutdown
        }
        callback();
    }
    async initObjects() {
        if (!this.mk2)
            return;
        for (const [key, value] of Object.entries(this.mk2.mk2Model)) {
            await this.setObjectNotExistsAsync(key, (0, state_objects_1.buildStateObject)(key, value));
        }
    }
    async mainLoop() {
        this.setTimeout(async () => {
            while (this.mainLoopRunning) {
                await this.updateStates();
                await sleep(this.config.interval * 1000);
            }
        }, 10 * 1000);
    }
    async updateStates() {
        try {
            if (!this.mk2)
                return;
            // Read-only state poll first. While the MultiPlus is booting or off
            // (state 10/20) no control command and no full poll is sent.
            await this.mk2.pollStateOnly();
            const state = this.mk2.mk2Model["state.state"].value;
            if (!(0, state_gate_1.isStableState)(state)) {
                this.log.debug("MultiPlus not stable yet (state " + state + "), deferring control writes");
                return;
            }
            await this.processToSendQueue();
            await this.mk2.poll();
            for (const [key, value] of Object.entries(this.mk2.mk2Model)) {
                const v = value;
                if (v.value !== v.valueOld && !v.setFunc) {
                    await this.setStateAsync(key, {
                        val: v.value,
                        ack: true,
                    });
                }
            }
        }
        catch (Exception) {
            this.log.error("ERROR updateStates : " + JSON.stringify(Exception));
            console.trace();
            // Publish the lost connection as a state, not only as a log line.
            try {
                await this.setStateAsync("info.connection", { val: false, ack: true });
            }
            catch (_a) {
                // ignore secondary state errors while handling a failure
            }
        }
    }
    async processToSendQueue() {
        if (!this.mk2)
            return;
        await (0, send_queue_1.processToSendQueue)(this.mk2, this.toSendQueue, this.log);
    }
    onStateChange(id, state) {
        if (!state) {
            this.log.info(`state ${id} deleted`);
            return;
        }
        const idShort = splitIdFromAdapter(id);
        if ((0, control_rules_1.shouldHandleControlState)(idShort, state) && this.mk2) {
            this.log.debug(`control ${id} -> MK2 value ${state.val}`);
            this.toSendQueue.push({
                name: idShort,
                value: state.val,
                attempts: 0,
            });
        }
    }
}
if (require.main !== module) {
    module.exports = (options) => new VictronMk2(options);
}
else {
    (() => new VictronMk2())();
}
//# sourceMappingURL=main.js.map