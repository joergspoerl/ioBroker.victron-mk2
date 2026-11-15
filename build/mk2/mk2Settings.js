"use strict";
/**
 * Setting metadata (CommandGetSettingInfo, protocol §7.3.8) and the read-only
 * setting/flag tables. Kept separate from the protocol class so the parsing and
 * scaling rules are testable without any serial port.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FLAGS1 = exports.READONLY_SETTINGS = exports.SettingInfoCollector = void 0;
exports.settingScale = settingScale;
exports.settingDisplayValue = settingDisplayValue;
exports.settingRawValue = settingRawValue;
exports.flags1Bit = flags1Bit;
/** Protocol §7.3.8: settings scale differently from RAM variables. */
function settingScale(sc) {
    if (sc > 0)
        return sc;
    if (sc < 0)
        return 1 / -sc;
    return 1;
}
/** DisplayValue := Scale * (x + Offset) */
function settingDisplayValue(info, raw) {
    return info.scale * (raw + info.offset);
}
function settingRawValue(info, display) {
    return Math.round(display / info.scale - info.offset);
}
/**
 * Collects the five W frames of a CommandGetSettingInfo answer.
 *
 * Responses 0x89 (Sc), 0x8A (Offset), 0x8B (Default), 0x8C (Minimum), 0x8D
 * (Maximum) arrive as 3-byte W frames, up to three of them packed into one MK2
 * frame. When Sc = 0 the setting is unsupported and nothing else follows.
 */
class SettingInfoCollector {
    constructor(id) {
        this.seen = new Set();
        this.info = {
            id,
            supported: true,
            sc: 0,
            scale: 1,
            offset: 0,
            def: null,
            min: null,
            max: null,
        };
    }
    /** Returns true once the answer is complete. */
    addFrame(frame) {
        if (frame[1] !== 0xff || frame[2] !== 0x57) {
            throw new Error("getSettingInfo: not a Winmon response frame");
        }
        for (let i = 3; i + 2 < frame.length; i += 3) {
            const cmd = frame[i];
            const value = frame[i + 1] | (frame[i + 2] << 8);
            const signed = value >= 0x8000 ? value - 0x10000 : value;
            switch (cmd) {
                case 0x89:
                    this.info.sc = signed;
                    this.info.scale = settingScale(signed);
                    if (signed === 0)
                        this.info.supported = false;
                    break;
                case 0x8A:
                    this.info.offset = signed;
                    break;
                case 0x8B:
                    this.info.def = value;
                    break;
                case 0x8C:
                    this.info.min = value;
                    break;
                case 0x8D:
                    this.info.max = value;
                    break;
                default:
                    break;
            }
            this.seen.add(cmd);
        }
        return this.complete();
    }
    /** True once the answer is complete (or explicitly unsupported). */
    isComplete() {
        return this.complete();
    }
    complete() {
        if (!this.seen.has(0x89))
            return false;
        if (!this.info.supported)
            return true;
        return [0x89, 0x8a, 0x8b, 0x8c, 0x8d].every((cmd) => this.seen.has(cmd));
    }
}
exports.SettingInfoCollector = SettingInfoCollector;
/**
 * Read-only settings that answer the open diagnostic questions without
 * VEConfigure. Loaded once per connection, never written by the adapter.
 */
exports.READONLY_SETTINGS = [
    { id: 2, key: "setting.UBatAbsorption", descr: "Absorption voltage", unit: "V", role: "value.voltage" },
    { id: 3, key: "setting.UBatFloat", descr: "Float voltage", unit: "V", role: "value.voltage" },
    { id: 5, key: "setting.UInvSetpoint", descr: "Inverter voltage setpoint", unit: "V", role: "value.voltage" },
    { id: 6, key: "setting.IMainsLimitAC1", descr: "Configured input current limit AC1", unit: "A", role: "value.current" },
    { id: 49, key: "setting.IMainsLimitAC2", descr: "Configured input current limit AC2", unit: "A", role: "value.current" },
    { id: 11, key: "setting.UBatLowLimit", descr: "DC low limit for the inverter", unit: "V", role: "value.voltage" },
    { id: 12, key: "setting.UBatLowHysteresis", descr: "DC low hysteresis for the inverter", unit: "V", role: "value.voltage" },
    { id: 44, key: "setting.UMainsLowest", descr: "Lowest acceptable mains voltage", unit: "V", role: "value.voltage" },
    { id: 45, key: "setting.UMainsLowestHysteresis", descr: "Hysteresis for the lowest mains voltage", unit: "V", role: "value.voltage" },
    { id: 46, key: "setting.UMainsHighest", descr: "Highest acceptable mains voltage", unit: "V", role: "value.voltage" },
    { id: 47, key: "setting.UMainsHighestHysteresis", descr: "Hysteresis for the highest mains voltage", unit: "V", role: "value.voltage" },
    { id: 48, key: "setting.AssistCurrentBoostFactor", descr: "PowerAssist current boost factor", unit: "", role: "value" },
    { id: 50, key: "setting.AESLowCurrentLimit", descr: "Low current limit for switching to AES", unit: "A", role: "value.current" },
    { id: 51, key: "setting.AESHysteresis", descr: "Hysteresis on the AES current limit", unit: "A", role: "value.current" },
    { id: 63, key: "setting.UBatLowPreAlarmOffset", descr: "UBat low pre-alarm offset (0x8000 = 0)", unit: "V", role: "value.voltage" },
];
exports.FLAGS1 = [
    { flag: 27, key: "setting.flag.AcceptWideInputFrequency", descr: "Accept wide input frequency" },
    { flag: 28, key: "setting.flag.DynamicCurrentLimiter", descr: "Dynamic current limiter" },
    { flag: 29, key: "setting.flag.TubularPlateTractionBatteryCurve", descr: "Use tubular plate traction battery curve" },
    { flag: 30, key: "setting.flag.RemoteOverrulesAC1", descr: "Remote overrules AC1" },
    { flag: 31, key: "setting.flag.LowPowerShutdownAES", descr: "Use low power shutdown in AES instead of modified sine" },
];
/** Bit number inside the Flags1 register for a global flag number. */
function flags1Bit(flag) {
    return flag - 16;
}
//# sourceMappingURL=mk2Settings.js.map