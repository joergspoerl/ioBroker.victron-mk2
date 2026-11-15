/**
 * RAM variable metadata (CommandGetRAMVarInfo, protocol §7.3.9) and device
 * identification helpers. Pure functions, no serial access.
 */

export interface RamInfo {
	id: number;
	/** Raw signed Sc field; Sc = 0 means the variable is not supported. */
	sc: number;
	/** Display scale after the RAM rule (different from the settings rule). */
	scale: number;
	offset: number;
	supported: boolean;
	/** Sc < 0 means the 16-bit value returned by ReadRAMVar is signed. */
	signed: boolean;
	/** Offset 0x8000 marks a bit field; Sc is then bit number + 1. */
	isBit: boolean;
	bit: number;
}

/** Protocol §7.3.9: Scale := Abs(Sc); if Scale >= 0x4000 -> 1/(0x8000-Scale). */
export function ramScale(sc: number): number {
	const s = Math.abs(sc);
	if (s >= 0x4000) return 1.0 / (0x8000 - s);
	return s;
}

export function makeRamInfo(id: number, sc: number, offset: number): RamInfo {
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
export function ramDisplayValue(info: RamInfo, raw: number): number {
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
export function formatDeviceVersion(version: number): string {
	const product = Math.floor(version / 100000);
	const model = Math.floor(version / 1000) % 100;
	const revision = version % 1000;
	return `${product} ${model} ${revision}`;
}
