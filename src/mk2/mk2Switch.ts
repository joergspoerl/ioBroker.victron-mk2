/**
 * Derive the VE.Bus panel switch state from the MasterMultiLED switch register
 * (protocol §6.2): SwitchCharge (bit 4) and SwitchInvert (bit 5) describe the
 * current state, so a manual front switch or panel change is visible to the
 * adapter instead of being overwritten by a stale local assumption.
 */
export function switchStateFromRegister(register: number): number {
	const charge = (register & 0b00010000) !== 0;
	const invert = (register & 0b00100000) !== 0;
	if (charge && invert) return 3; // On
	if (charge && !invert) return 1; // Charger only
	if (!charge && invert) return 2; // Inverter only
	return 4; // Off
}

export const SWITCH_STATE_NAMES: { [key: string]: string } = {
	"1": "Charger only",
	"2": "Inverter only",
	"3": "On",
	"4": "Off",
};
