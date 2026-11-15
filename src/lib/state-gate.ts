/**
 * A MultiPlus must not receive control commands while it is booting or down.
 * state.state encoding: 0=down, 10=startup, 20=off; everything else (bypass,
 * charge, invert, assist) is considered stable.
 *
 * Off (20) is deliberately NOT treated as unstable (review H2): the device must
 * stay switchable via the explicit power-on controls, otherwise an adapter could
 * never recover a switched-off unit.
 */
export function isStableState(state: unknown): boolean {
	if (typeof state !== "number" || !Number.isFinite(state)) {
		return false;
	}
	return state !== 0 && state !== 10;
}

/** Controls that are allowed while the device is Off (20): explicit power-on. */
export const POWER_ON_CONTROLS = new Set(["control.switch_state", "control.grid_mode"]);

export function controlAllowedWhileOff(id: string): boolean {
	return POWER_ON_CONTROLS.has(id);
}
