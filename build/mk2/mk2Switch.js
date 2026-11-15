"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SWITCH_STATE_NAMES = void 0;
exports.switchStateFromRegister = switchStateFromRegister;
/**
 * Derive the VE.Bus panel switch state from the MasterMultiLED switch register
 * (protocol §6.2): SwitchCharge (bit 4) and SwitchInvert (bit 5) describe the
 * current state, so a manual front switch or panel change is visible to the
 * adapter instead of being overwritten by a stale local assumption.
 */
function switchStateFromRegister(register) {
    const charge = (register & 0b00010000) !== 0;
    const invert = (register & 0b00100000) !== 0;
    if (charge && invert)
        return 3; // On
    if (charge && !invert)
        return 1; // Charger only
    if (!charge && invert)
        return 2; // Inverter only
    return 4; // Off
}
exports.SWITCH_STATE_NAMES = {
    "1": "Charger only",
    "2": "Inverter only",
    "3": "On",
    "4": "Off",
};
//# sourceMappingURL=mk2Switch.js.map