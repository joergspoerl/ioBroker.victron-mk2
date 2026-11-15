import { Mk2DataEntry } from "../mk2/mk2Model";

/**
 * Which model entries need publishing: non-control states whose value changed
 * since the last successful publication, optionally restricted to a subset.
 * Used for the early, read-only state poll as well as for the full poll.
 */
export function selectStatesToPublish(model: Record<string, Mk2DataEntry>, only?: string[]): string[] {
	const out: string[] = [];
	for (const [key, entry] of Object.entries(model)) {
		if (entry.setFunc) continue;
		if (only && !only.includes(key)) continue;
		if (entry.value === entry.valueOld) continue;
		out.push(key);
	}
	return out;
}
