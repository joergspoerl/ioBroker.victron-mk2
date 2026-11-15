"use strict";
/**
 * RAM variable metadata (CommandGetRAMVarInfo, protocol §7.3.9) and device
 * identification helpers. Pure functions, no serial access.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ramScale = ramScale;
exports.makeRamInfo = makeRamInfo;
exports.ramDisplayValue = ramDisplayValue;
exports.formatDeviceVersion = formatDeviceVersion;
/** Protocol §7.3.9: Scale := Abs(Sc); if Scale >= 0x4000 -> 1/(0x8000-Scale). */
function ramScale(sc) {
    const s = Math.abs(sc);
    if (s >= 0x4000)
        return 1.0 / (0x8000 - s);
    return s;
}
function makeRamInfo(id, sc, offset) {
    return {
        id,
        sc,
        scale: ramScale(sc),
        offset,
        supported: sc !== 0,
        signed: sc < 0,
        // The offset arrives as signed 16-bit, so the 0x8000 sentinel shows up as
        // -32768. Compare on the raw 16-bit pattern, not on the signed number.
        isBit: (offset & 0xffff) === 0x8000,
        bit: sc - 1,
    };
}
/** DisplayValue := Scale * (x + Offset), with the sign from Sc. */
function ramDisplayValue(info, raw) {
    if (info.isBit) {
        return (raw >> info.bit) & 1;
    }
    const signedRaw = info.signed && raw >= 0x8000 ? raw - 0x10000 : raw;
    return info.scale * (signedRaw + info.offset);
}
/**
 * VE.Bus product version AA BB CCC: product type, model, version.
 * Example: 2612431 -> "26 12 431".
 */
function formatDeviceVersion(version) {
    const product = Math.floor(version / 100000);
    const model = Math.floor(version / 1000) % 100;
    const revision = version % 1000;
    return `${product} ${model} ${revision}`;
}
//# sourceMappingURL=mk2Ram.js.map