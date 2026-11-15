import { expect } from "chai";
import * as proxyquire from "proxyquire";

/**
 * Adapter lifecycle tests with a stubbed ioBroker runtime. No hardware and no
 * js-controller are involved; the point is to cover the paths that the dummy
 * test never touched (onReady failure, empty port, startup state, unload).
 */
class FakeAdapter {
	public log: any;
	public errors: string[] = [];
	public states: Record<string, any> = {};
	public objects: Record<string, any> = {};
	public config: any = {};
	public handlers: Record<string, (...args: any[]) => any> = {};
	public subscriptions: string[] = [];
	public failGetObject = false;

	constructor(public options: any) {
		this.log = {
			level: "info",
			debug: () => undefined,
			info: () => undefined,
			warn: () => undefined,
			error: (msg: string) => {
				this.errors.push(msg);
			},
		};
	}

	on(event: string, cb: any): void {
		this.handlers[event] = cb;
	}

	async setStateAsync(id: string, state: any): Promise<void> {
		this.states[id] = state;
	}

	async getObjectAsync(id: string): Promise<any> {
		if (this.failGetObject) {
			throw new Error("state database unavailable");
		}
		return this.objects[id];
	}

	async setObjectNotExistsAsync(id: string, obj: any): Promise<void> {
		this.objects[id] = obj;
	}

	async extendObjectAsync(id: string, obj: any): Promise<void> {
		this.objects[id] = { ...this.objects[id], ...obj };
	}

	subscribeStates(pattern: string): void {
		this.subscriptions.push(pattern);
	}
}

function createAdapter(config: any, failGetObject = false): any {
	const { default: _unused, ...rest } = {} as any; // keep linters quiet about unused vars
	void rest;
	const factory = proxyquire("./main", {
		"@iobroker/adapter-core": { Adapter: FakeAdapter },
	}) as any;
	const adapter = factory({});
	adapter.config = config;
	adapter.failGetObject = failGetObject;
	return adapter;
}

describe("adapter lifecycle", () => {
	it("reports a failed onReady instead of crashing (issue #57)", async () => {
		const adapter = createAdapter({ portPath: "/dev/null", interval: 3600 }, true);
		await adapter.handlers.ready();
		expect(adapter.errors.some((m: string) => m.includes("onReady failed"))).to.equal(true);
		expect(adapter.states["info.connection"].val).to.equal(false);
		expect(adapter.pollLoop).to.equal(undefined);
	});

	it("creates objects and reports not-connected with an empty port (issues #52, #58)", async () => {
		const adapter = createAdapter({ portPath: "", interval: 3600 });
		await adapter.handlers.ready();
		expect(Object.keys(adapter.objects).length).to.be.greaterThan(50);
		expect(adapter.states["info.connection"].val).to.equal(false);
		expect(adapter.pollLoop).to.equal(undefined);
		expect(adapter.subscriptions).to.have.length(0);
	});

	it("starts with connection=false and only then starts the loop (issue #58)", async () => {
		const adapter = createAdapter({ portPath: "/dev/null", interval: 3600 });
		await adapter.handlers.ready();
		expect(adapter.states["info.connection"].val).to.equal(false);
		expect(adapter.pollLoop).to.not.equal(undefined);
		expect(adapter.subscriptions).to.deep.equal(["control.*"]);
		await adapter.handlers.unload(() => undefined);
	});

	it("does not start a second loop when mainLoop runs twice (issue #64)", async () => {
		const adapter = createAdapter({ portPath: "/dev/null", interval: 3600 });
		await adapter.handlers.ready();
		const first = adapter.pollLoop;
		adapter.mainLoop();
		expect(adapter.pollLoop).to.equal(first);
		await adapter.handlers.unload(() => undefined);
	});
});
