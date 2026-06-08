/**
 * Multi-select fields (multiple_choice, smart_dropdown, custom_table_selector)
 * store selected values in the order they were clicked. For display we want a
 * stable, canonical order — the order the options are defined in the field
 * config — so a checklist always reads top-to-bottom regardless of click order.
 *
 * Order `selected` by each item's index in `canonical`. Items not present in
 * `canonical` (e.g. a value whose option was later removed) keep their relative
 * order and are appended last, so nothing is ever dropped.
 */
export function orderByCanonical(selected: string[], canonical: string[]): string[] {
	if (selected.length < 2) return selected;
	const rank = new Map<string, number>();
	canonical.forEach((key, i) => {
		if (!rank.has(key)) rank.set(key, i);
	});
	const unknown = canonical.length; // unknowns sort after all known options
	return selected
		.map((value, i) => ({ value, i, r: rank.get(value) ?? unknown }))
		.sort((a, b) => a.r - b.r || a.i - b.i)
		.map((x) => x.value);
}
