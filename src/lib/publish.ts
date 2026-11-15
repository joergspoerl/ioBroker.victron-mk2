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

/**
 * Publish the selected states and remember what was actually published.
 * `valueOld` is only updated after a successful write, so a failed publication
 * is retried on the next cycle instead of being marked as done (review T8).
 */
export async function publishModel(
	model: Record<string, Mk2DataEntry>,
	setState: (key: string, value: Mk2DataEntry["value"]) => Promise<void>,
	only?: string[],
): Promise<number> {
	let published = 0;
	for (const key of selectStatesToPublish(model, only)) {
		const entry = model[key];
		await setState(key, entry.value);
		entry.valueOld = entry.value;
		published++;
	}
	return published;
}
