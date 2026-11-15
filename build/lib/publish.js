"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectStatesToPublish = selectStatesToPublish;
exports.publishModel = publishModel;
/**
 * Which model entries need publishing: non-control states whose value changed
 * since the last successful publication, optionally restricted to a subset.
 * Used for the early, read-only state poll as well as for the full poll.
 */
function selectStatesToPublish(model, only) {
    const out = [];
    for (const [key, entry] of Object.entries(model)) {
        if (entry.setFunc)
            continue;
        if (only && !only.includes(key))
            continue;
        if (entry.value === entry.valueOld)
            continue;
        out.push(key);
    }
    return out;
}
/**
 * Publish the selected states and remember what was actually published.
 * `valueOld` is only updated after a successful write, so a failed publication
 * is retried on the next cycle instead of being marked as done (review T8).
 */
async function publishModel(model, setState, only) {
    let published = 0;
    for (const key of selectStatesToPublish(model, only)) {
        const entry = model[key];
        await setState(key, entry.value);
        entry.valueOld = entry.value;
        published++;
    }
    return published;
}
//# sourceMappingURL=publish.js.map