"use strict";
/*
 * Created with @iobroker/create-adapter v2.0.2
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitIdFromAdapter = void 0;
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
const mk2Protocol_1 = require("./mk2/mk2Protocol");
// Load your modules here, e.g.:
// import * as fs from "fs";
// helper function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function splitIdFromAdapter(str) {
    const delimiter = ".";
    const start = 2;
    const tokens = str.split(delimiter).slice(start);
    return tokens.join(delimiter);
}
exports.splitIdFromAdapter = splitIdFromAdapter;
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
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info("config interval: " + this.config.interval);
        this.log.info("config portPath: " + this.config.portPath);
        this.mk2 = new mk2Protocol_1.Mk2Protocol(this.config.portPath, this.log);
        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
        await this.setObjectNotExistsAsync("testVariable", {
            type: "state",
            common: {
                name: "testVariable",
                type: "boolean",
                role: "indicator",
                read: true,
                write: true,
            },
            native: {},
        });
        await this.initObjects();
        this.mainLoop();
        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
        this.subscribeStates("control.*");
        // this.subscribeStates("setting.flag.DisableCharge");
        // this.subscribeStates("setting.flag.WeakACInput");
        // this.subscribeStates("setting.IBatBulk");
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            this.mainLoopRunning = false;
            callback();
        }
        catch (e) {
            callback();
        }
    }
    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  */
    // private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
    // 	if (obj) {
    // 		// The object was changed
    // 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    // 	} else {
    // 		// The object was deleted
    // 		this.log.info(`object ${id} deleted`);
    // 	}
    // }
    async initObjects() {
        if (this.mk2) {
            for (const [key, value] of Object.entries(this.mk2.mk2Model)) {
                const v = value;
                if (v.states) {
                    await this.setObjectNotExistsAsync(key, {
                        type: "state",
                        common: {
                            name: v.descr,
                            type: v.type,
                            role: "state",
                            read: true,
                            write: v.setFunc ? true : false,
                            unit: v.unit,
                            states: v.states
                        },
                        native: {},
                    });
                }
                await this.setObjectNotExistsAsync(key, {
                    type: "state",
                    common: {
                        name: v.descr,
                        type: v.type,
                        role: "state",
                        read: true,
                        write: v.setFunc ? true : false,
                        unit: v.unit,
                    },
                    native: {},
                });
            }
        }
    }
    async mainLoop() {
        this.setTimeout(async () => {
            while (this.mainLoopRunning) {
                await this.updateStates();
                this.log.debug("sleep -> interval = " + this.config.interval * 1000);
                await sleep(this.config.interval * 1000);
            }
        }, 10 * 1000);
    }
    async updateStates() {
        try {
            if (this.mk2) {
                await this.processToSendQueue();
                await this.mk2.poll();
                for (const [key, value] of Object.entries(this.mk2.mk2Model)) {
                    const v = value;
                    // this.log.debug("key: " + key)
                    if (v.value !== v.valueOld && !v.setFunc) {
                        // if (v.value !== v.valueOld) {
                        // this.log.debug("key     : " + key)
                        // this.log.debug("value   : " + v.value)
                        // this.log.debug("valueOld: " + v.valueOld)
                        await this.setStateAsync(key, {
                            val: v.value,
                            ack: true
                        });
                    }
                    // await sleep(10)
                }
            }
        }
        catch (Exception) {
            this.log.error("ERROR updateStates : " + JSON.stringify(Exception));
            console.trace();
        }
    }
    async processToSendQueue() {
        // this.log.debug("processToSendQueue start")
        // await sleep(10000)
        while (this.toSendQueue.length > 0) {
            const item = this.toSendQueue.shift();
            if (item && this.mk2) {
                this.mk2.mk2Model[item.name].value = item.value;
                const setFunc = this.mk2.mk2Model[item.name].setFunc;
                if (this.mk2.mk2Model[item.name] && setFunc) {
                    this.log.debug("call mk2 function value: " + item.value);
                    try {
                        await setFunc(this.mk2, item.value);
                    }
                    catch (ex) {
                        this.log.error("call mk2 function exception: " + ex);
                    }
                }
            }
        }
        // this.log.debug("processToSendQueue end")
        // await sleep(10000)
    }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            const idShort = splitIdFromAdapter(id);
            if ((state.ack == false
                && idShort == "control.set_assist"
                || idShort == "control.force_state"
                || idShort == "control.DisableCharge"
                || idShort == "control.WeakACInput"
                || idShort == "control.IBatBulk")
                && this.mk2) {
                if (typeof state.val == "number") {
                    this.toSendQueue.push({ name: idShort, value: state.val });
                }
            }
        }
        else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }
}
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new VictronMk2(options);
}
else {
    // otherwise start the instance directly
    (() => new VictronMk2())();
}
//# sourceMappingURL=main.js.map