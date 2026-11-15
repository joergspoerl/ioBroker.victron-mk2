"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStateObject = buildStateObject;
/** Build the ioBroker state object from the model definition. */
function buildStateObject(key, v) {
    const common = {
        name: v.descr,
        type: v.type,
        role: v.role,
        read: true,
        write: !!v.setFunc,
        unit: v.unit,
    };
    if (v.states) {
        common.states = v.states;
    }
    if (key === "control.set_assist") {
        common.min = 0;
        common.max = 16;
        common.def = 16;
    }
    return {
        type: "state",
        common,
        native: {},
    };
}
//# sourceMappingURL=state-objects.js.map