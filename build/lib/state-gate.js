"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POWER_ON_CONTROLS = void 0;
exports.isStableState = isStableState;
exports.controlAllowedWhileOff = controlAllowedWhileOff;
/**
 * A MultiPlus must not receive control commands while it is booting or down.
 * state.state encoding: 0=down, 10=startup, 20=off; everything else (bypass,
 * charge, invert, assist) is considered stable.
 *
 * Off (20) is deliberately NOT treated as unstable (review H2): the device must
 * stay switchable via the explicit power-on controls, otherwise an adapter could
 * never recover a switched-off unit.
 */
function isStableState(state) {
    if (typeof state !== "number" || !Number.isFinite(state)) {
        return false;
    }
    // state.state is encoded as mainState * 10 + subState (protocol §7.3.2).
    // Checking only 0/10 missed every substate of Down/Startup (1..9, 11..19).
    const mainState = Math.floor(state / 10);
    return mainState !== 0 && mainState !== 1;
}
/** Controls that are allowed while the device is Off (20): explicit power-on. */
exports.POWER_ON_CONTROLS = new Set(["control.switch_state", "control.grid_mode"]);
function controlAllowedWhileOff(id) {
    return exports.POWER_ON_CONTROLS.has(id);
}
//# sourceMappingURL=state-gate.js.map