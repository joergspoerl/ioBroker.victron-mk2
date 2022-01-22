/*
 * Created with @iobroker/create-adapter v2.0.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import { Mk2DataEntry } from "./mk2/mk2Model";
import { Mk2Protocol } from "./mk2/mk2Protocol";

// Load your modules here, e.g.:
// import * as fs from "fs";

// helper function
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function splitIdFromAdapter(str: string): string  {
	const delimiter = "."
	const start = 2
	const tokens = str.split(delimiter).slice(start)
	return tokens.join(delimiter);
}


class VictronMk2 extends utils.Adapter {

	mk2: Mk2Protocol | undefined
	interval = 2000;
	mainLoopRunning = true

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "victron-mk2",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		// Initialize your adapter here

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.log.info("config option1: " + this.config.option1);
		this.log.info("config option2: " + this.config.option2);
		this.log.info("config interval: " + this.config.interval);
		this.log.info("config portPath: " + this.config.portPath);

		this.mk2 = new Mk2Protocol(this.config.portPath, this.log)

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
		// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		// this.subscribeStates("lights.*");
		// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
		// this.subscribeStates("*");

		/*
			setState examples
			you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
		// the variable testVariable is set to true as command (ack=false)
		await this.setStateAsync("testVariable", true);

		// same thing, but the value is flagged "ack"
		// ack should be always set to true if the value is received from or acknowledged from the target system
		await this.setStateAsync("testVariable", { val: true, ack: true });

		// same thing, but the state is deleted after 30s (getState will return null afterwards)
		await this.setStateAsync("testVariable", { val: true, ack: true, expire: 30 });

		// examples for the checkPassword/checkGroup functions
		let result = await this.checkPasswordAsync("admin", "iobroker");
		this.log.info("check user admin pw iobroker: " + result);

		result = await this.checkGroupAsync("admin", "admin");
		this.log.info("check group user admin group admin: " + result);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);
			this.mainLoopRunning = false;
			callback();
		} catch (e) {
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
	private async initObjects(): Promise<void> {
		if (this.mk2) {
			for (const [key, value] of Object.entries(this.mk2.mk2Model)) {
				const v = value as Mk2DataEntry
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

	private async mainLoop(): Promise<void> {
		this.setTimeout(async ()=>{
			while(this.mainLoopRunning) {
				await this.updateStates();
				this.log.debug("sleep -> interval = " + this.config.interval * 1000)
				await sleep(this.config.interval * 1000)
			}
		}, 10*1000)
	}


	private async updateStates(): Promise<void> {
		try {
			if (this.mk2) {
				await this.mk2.poll()

				for (const [key, value] of Object.entries(this.mk2.mk2Model)) {
					const v = value as Mk2DataEntry;
					if (v.value !== v.valueOld && !v.setFunc) {
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
		} catch (Exception) {
			this.log.error("ERROR updateStates : " + JSON.stringify(Exception))
			console.trace()
		}

	}


	/**
	 * Is called if a subscribed state changes
	 */
	private  onStateChange(id: string, state: ioBroker.State | null | undefined) : void {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

			const idShort = splitIdFromAdapter(id)
			if ((
				   idShort == "control.set_assist"
				|| idShort == "control.force_state"
			    )
				&& this.mk2) {

				this.mk2.mk2Model[idShort].value = state.val
				const setFunc = this.mk2.mk2Model[idShort].setFunc
				if (this.mk2.mk2Model[idShort] && setFunc) {
					setFunc(this.mk2, state.val as number)
				}
			}
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  */
	// private onMessage(obj: ioBroker.Message): void {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new VictronMk2(options);
} else {
	// otherwise start the instance directly
	(() => new VictronMk2())();
}