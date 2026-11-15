/**
 * A MultiPlus must not receive control commands while it is booting or off.
 * state.state encoding: 0=down, 10=startup, 20=off; everything else (bypass,
 * charge, invert, assist) is considered stable.
 */
export function isStableState(state: unknown): boolean {
	if (typeof state !== "number" || !Number.isFinite(state)) {
		return false;
	}
	return state !== 0 && state !== 10 && state !== 20;
}
