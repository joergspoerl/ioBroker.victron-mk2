"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStableState = isStableState;
/**
 * A MultiPlus must not receive control commands while it is booting or off.
 * state.state encoding: 0=down, 10=startup, 20=off; everything else (bypass,
 * charge, invert, assist) is considered stable.
 */
function isStableState(state) {
    if (typeof state !== "number" || !Number.isFinite(state)) {
        return false;
    }
    return state !== 0 && state !== 10 && state !== 20;
}
//# sourceMappingURL=state-gate.js.map