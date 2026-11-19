// This file extends the AdapterConfig type from "@iobroker/types"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			interval: number;
			portPath: string;
			/** Optional response budget per MK2 frame in ms (default 1500). */
			responseTimeout?: number;
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};