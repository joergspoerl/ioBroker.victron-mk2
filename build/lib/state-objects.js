"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStateObject = buildStateObject;
exports.objectDefinitionChanged = objectDefinitionChanged;
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
        // max/def are set from assist.maxlimit after device discovery (N4);
        // a static default here would reset them on every adapter start.
    }
    return {
        type: "state",
        common,
        native: {},
    };
}
/**
 * True when the model definition differs from the stored object and therefore
 * needs an upgrade. Only definition fields are compared: user customisation
 * (e.g. `common.custom` for InfluxDB history) must not trigger or be overwritten.
 */
function objectDefinitionChanged(existing, next) {
    var _a, _b, _c, _d;
    const fields = ["name", "type", "role", "read", "write", "unit", "states", "min", "max", "def"];
    for (const field of fields) {
        const before = JSON.stringify((_b = (_a = existing === null || existing === void 0 ? void 0 : existing.common) === null || _a === void 0 ? void 0 : _a[field]) !== null && _b !== void 0 ? _b : null);
        const after = JSON.stringify((_d = (_c = next === null || next === void 0 ? void 0 : next.common) === null || _c === void 0 ? void 0 : _c[field]) !== null && _d !== void 0 ? _d : null);
        if (before !== after) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=state-objects.js.map