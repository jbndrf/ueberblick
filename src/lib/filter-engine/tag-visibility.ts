/**
 * Simple-filter (Simple tab) visibility for workflow instances.
 *
 * The Simple filter narrows a workflow's instances by a "filterable" tag value
 * — either the instance's `current_stage_id` (filterBy: 'stage') or a field
 * value (filterBy: 'field'). Both the clustered point layer (MapCanvas) and the
 * non-clustered shape layer (InstanceGeometryLayer) must apply it identically,
 * so the predicate lives here rather than in either renderer.
 */

/** Parse a field value that might be a JSON array (multiple_choice) into individual values. */
export function splitMultiValue(value: string): string[] {
	if (value.startsWith('[')) {
		try {
			return JSON.parse(value);
		} catch {
			/* fall through */
		}
	}
	return [value];
}

/** Pre-parse a `instanceId -> raw filter value` map into `instanceId -> values[]`. */
export function parseFilterValues(
	filterableValues: ReadonlyMap<string, string>
): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const [id, value] of filterableValues) {
		map.set(id, splitMultiValue(value));
	}
	return map;
}

/**
 * An instance passes when its workflow has no tag filter configured, when the
 * instance carries no filterable value at all, or when at least one of its
 * values is still toggled on.
 */
export function passesTagFilter(
	instanceId: string,
	workflowId: string,
	visibleTagValues: ReadonlyMap<string, ReadonlySet<string>>,
	parsedFilterValues: ReadonlyMap<string, string[]>
): boolean {
	const allowedValues = visibleTagValues.get(workflowId);
	if (!allowedValues) return true;
	const values = parsedFilterValues.get(instanceId);
	if (!values) return true;
	return values.some((v) => allowedValues.has(v));
}
