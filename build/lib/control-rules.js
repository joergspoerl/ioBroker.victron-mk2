"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTROL_STATE_IDS = void 0;
exports.shouldHandleControlState = shouldHandleControlState;
/** ioBroker control states that are allowed to be forwarded to the MK2. */
exports.CONTROL_STATE_IDS = new Set([
    "control.set_assist",
    "control.force_state",
    "control.DisableCharge",
    "control.WeakACInput",
    "control.IBatBulk",
    "control.switch_state",
    "control.grid_mode",
    "control.DisableAES",
    "control.AssistEnabled",
    "control.DynamicCurrentLimiter",
    "control.UBatAbsorption",
    "control.UBatFloat",
    "control.IMainsLimitAC1",
]);
/**
 * Only explicit, unacknowledged numeric control writes are forwarded.
 * This replaces the previous mixed-precedence condition which processed
 * force_state/DisableCharge/WeakACInput/IBatBulk even when ack was true.
 */
function shouldHandleControlState(idShort, state) {
    return !!state && state.ack === false && typeof state.val === "number" && exports.CONTROL_STATE_IDS.has(idShort);
}
//# sourceMappingURL=control-rules.js.map