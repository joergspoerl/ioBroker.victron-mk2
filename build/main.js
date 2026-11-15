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
const publish_1 = require("./lib/publish");
const poll_loop_1 = require("./lib/poll-loop");
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
        this.toSendQueue = [];
        this.assistLimitObjectMax = null;
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    async onReady() {
        try {
            await this.startAdapter();
        }
        catch (error) {
            // Never leave an unhandled rejection or a crash/restart loop (N1).
            const message = error instanceof Error ? error.message : String(error);
            this.log.error("onReady failed: " + message);
            try {
                await this.setStateAsync("info.connection", { val: false, ack: true });
            }
            catch (_a) {
                // even the state write may fail in this situation
            }
        }
    }
    async startAdapter() {
        const interval = Number(this.config.interval);
        this.config.interval = Number.isFinite(interval) && interval >= 1 ? interval : 2;
        this.log.info("config interval: " + this.config.interval);
        this.log.info("config portPath: " + this.config.portPath);
        this.mk2 = new mk2Protocol_1.Mk2Protocol(this.config.portPath, this.log);
        const responseTimeout = Number(this.config.responseTimeout);
        if (Number.isFinite(responseTimeout) && responseTimeout >= 250) {
            this.mk2.conn.responseTimeoutMs = responseTimeout;
            this.log.info("config responseTimeout: " + responseTimeout + " ms");
        }
        // Create the objects even without a configured port and report "not
        // connected", instead of leaving no state at all (review N6).
        await this.initObjects();
        // Nothing is connected yet at startup; never keep a persisted true (N2).
        await this.setStateAsync("info.connection", { val: false, ack: true });
        if (!this.config.portPath) {
            this.log.error("config portPath is empty; adapter will not poll until it is configured");
            await this.setStateAsync("info.connection", { val: false, ack: true });
            return;
        }
        this.mainLoop();
        this.subscribeStates("control.*");
    }
    async onUnload(callback) {
        var _a;
        // Wait for the running poll/control iteration before closing the port,
        // otherwise a write can still be in flight during shutdown (review T12).
        if (this.pollLoop) {
            await this.pollLoop.stop(3000);
        }
        try {
            await ((_a = this.mk2) === null || _a === void 0 ? void 0 : _a.conn.shutdown());
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
            const object = (0, state_objects_1.buildStateObject)(key, value);
            const existing = await this.getObjectAsync(key);
            if (!existing) {
                await this.setObjectNotExistsAsync(key, object);
            }
            else if ((0, state_objects_1.objectDefinitionChanged)(existing, object)) {
                // Upgrade roles/descriptions/units/state maps on existing objects;
                // extendObject keeps user customisation such as InfluxDB history.
                await this.extendObjectAsync(key, object);
            }
        }
    }
    /** Keep control.set_assist's limits in sync with the discovered device. */
    async updateAssistLimitObject() {
        if (!this.mk2)
            return;
        const max = this.mk2.mk2Model["assist.maxlimit"].value;
        if (typeof max != "number" || max <= 0 || max === this.assistLimitObjectMax)
            return;
        this.assistLimitObjectMax = max;
        await this.extendObjectAsync("control.set_assist", {
            common: { min: 0, max, def: max },
        });
    }
    mainLoop() {
        // Idempotent: a second ready event must never orphan a running loop (N8).
        if (this.pollLoop) {
            return;
        }
        this.pollLoop = new poll_loop_1.PollLoop(() => this.updateStates(), this.config.interval * 1000);
        this.pollLoop.start(10 * 1000);
    }
    async updateStates() {
        var _a;
        try {
            if (!this.mk2)
                return;
            // Read-only state poll first. While the MultiPlus is booting or off
            // (state 10/20) no control command and no full poll is sent.
            await this.mk2.pollStateOnly();
            // Publish the state poll as well: an Off or a boot loop must be visible
            // in ioBroker and to the watchdog, not just the last stable state.
            await this.publishStates(["state.state", "state.substate", "info.address"]);
            await this.setStateAsync("info.connection", { val: true, ack: true });
            const state = this.mk2.mk2Model["state.state"].value;
            if (!(0, state_gate_1.isStableState)(state)) {
                this.log.debug("MultiPlus not stable yet (state " + state + "), deferring control writes");
                return;
            }
            if (state === 20) {
                // Off must not become a one-way state (review H2): only the explicit
                // power-on controls are forwarded, everything else is dropped.
                const before = this.toSendQueue.length;
                this.toSendQueue = this.toSendQueue.filter((item) => (0, state_gate_1.controlAllowedWhileOff)(item.name));
                if (this.toSendQueue.length !== before) {
                    this.log.warn("device is Off: only switch_state/grid_mode writes are allowed, other control writes dropped");
                }
            }
            await this.processToSendQueue();
            await this.mk2.poll();
            await this.publishStates();
            await this.updateAssistLimitObject();
        }
        catch (Exception) {
            // JSON.stringify(Error) yields "{}", so log the message and stack.
            const message = Exception instanceof Error ? ((_a = Exception.stack) !== null && _a !== void 0 ? _a : Exception.message) : JSON.stringify(Exception);
            this.log.error("ERROR updateStates : " + message);
            // Publish the lost connection as a state, not only as a log line.
            try {
                await this.setStateAsync("info.connection", { val: false, ack: true });
                if (this.mk2) {
                    await this.setStateAsync("diag.timeouts", { val: this.mk2.conn.timeouts, ack: true });
                    await this.setStateAsync("diag.checksum_errors", { val: this.mk2.conn.checksumErrors, ack: true });
                    await this.setStateAsync("diag.last_error", { val: this.mk2.conn.lastError, ack: true });
                }
            }
            catch (_b) {
                // ignore secondary state errors while handling a failure
            }
        }
    }
    async publishStates(only) {
        if (!this.mk2)
            return;
        await (0, publish_1.publishModel)(this.mk2.mk2Model, async (key, value) => {
            await this.setStateAsync(key, { val: value, ack: true });
        }, only);
    }
    async processToSendQueue() {
        if (!this.mk2)
            return;
        const completed = await (0, send_queue_1.processControlWrites)(this.mk2, this.toSendQueue, this.log);
        for (const item of completed) {
            // Acknowledge successful writes; ack=true is never forwarded again, so
            // this cannot retrigger the control path (review T7).
            await this.setStateAsync(item.name, { val: item.value, ack: true });
        }
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
                ts: Date.now(),
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