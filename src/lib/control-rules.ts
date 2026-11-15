/** ioBroker control states that are allowed to be forwarded to the MK2. */
export const CONTROL_STATE_IDS = new Set([
	"control.set_assist",
	"control.force_state",
	"control.DisableCharge",
	"control.WeakACInput",
	"control.IBatBulk",
	"control.switch_state",
	"control.grid_mode",
]);

/**
 * Only explicit, unacknowledged numeric control writes are forwarded.
 * This replaces the previous mixed-precedence condition which processed
 * force_state/DisableCharge/WeakACInput/IBatBulk even when ack was true.
 */
export function shouldHandleControlState(
	idShort: string,
	state: ioBroker.State | null | undefined,
): boolean {
	return !!state && state.ack === false && typeof state.val === "number" && CONTROL_STATE_IDS.has(idShort);
}
