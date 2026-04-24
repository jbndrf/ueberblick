/**
 * Pure filter-engine predicate.
 *
 * Takes a ViewDefinition and a context bundle and returns a predicate
 * function that decides whether a workflow instance matches the view.
 * No Svelte dependencies — unit-testable in isolation.
 *
 * Semantics:
 *   - AND across clauses / across top-level scope filters / across free_text.
 *   - OR within a single `in` clause's `values`.
 *   - Empty `values` on an `in` clause, empty `text` on a `contains` clause,
 *     and `min=null && max=null` / `from=null && to=null` on range clauses
 *     are no-ops (skipped), so a half-built view still shows data.
 */

import type {
	FieldValue,
	FilterClause,
	ViewDefinition,
	WorkflowInstance
} from '$lib/participant-state/types';

export interface PredicateContext {
	/** Reference instant; date clauses compute windows against this. */
	now: Date;
	/** instance.id -> field values belonging to that instance. */
	fieldValuesByInstance: Map<string, FieldValue[]>;
	/** Optional: workflowId -> categoryId for category-scope filtering. */
	workflowCategoryById?: Map<string, string>;
}

export function buildPredicate(
	def: ViewDefinition,
	ctx: PredicateContext
): (instance: WorkflowInstance) => boolean {
	const freeText = (def.free_text ?? '').trim().toLowerCase();

	return (instance) => {
		if (
			def.workflow_ids.length > 0 &&
			!def.workflow_ids.includes(instance.workflow_id)
		) {
			return false;
		}

		if (def.category_ids.length > 0) {
			const categoryId = ctx.workflowCategoryById?.get(instance.workflow_id);
			if (!categoryId || !def.category_ids.includes(categoryId)) return false;
		}

		for (const clause of def.clauses) {
			if (!matchesClause(instance, clause, ctx)) return false;
		}

		if (freeText.length > 0) {
			const values = ctx.fieldValuesByInstance.get(instance.id) ?? [];
			const hit = values.some((v) =>
				(v.value ?? '').toLowerCase().includes(freeText)
			);
			if (!hit) return false;
		}

		return true;
	};
}

function matchesClause(
	instance: WorkflowInstance,
	clause: FilterClause,
	ctx: PredicateContext
): boolean {
	switch (clause.field) {
		case 'stage':
			if (clause.values.length === 0) return true;
			if (instance.workflow_id !== clause.workflow_id) return true;
			return clause.values.includes(instance.current_stage_id);

		case 'field_value': {
			if (instance.workflow_id !== clause.workflow_id) return true;
			const values = ctx.fieldValuesByInstance.get(instance.id) ?? [];
			const matching = values.filter((v) => v.field_key === clause.field_key);

			if (clause.op === 'in') {
				if (clause.values.length === 0) return true;
				if (matching.length === 0) return false;
				return matching.some((v) => fieldValueInList(v.value, clause.values));
			}

			if (clause.op === 'contains') {
				const needle = clause.text.trim().toLowerCase();
				if (needle.length === 0) return true;
				if (matching.length === 0) return false;
				return matching.some((v) =>
					(v.value ?? '').toLowerCase().includes(needle)
				);
			}

			if (clause.op === 'number_range') {
				if (clause.min === null && clause.max === null) return true;
				if (matching.length === 0) return false;
				return matching.some((v) => {
					const n = Number(v.value);
					if (!Number.isFinite(n)) return false;
					if (clause.min !== null && n < clause.min) return false;
					if (clause.max !== null && n > clause.max) return false;
					return true;
				});
			}

			if (clause.op === 'date_range') {
				if (!clause.from && !clause.to) return true;
				if (matching.length === 0) return false;
				const fromTs = clause.from ? Date.parse(clause.from) : null;
				const toTs = clause.to ? Date.parse(clause.to) : null;
				return matching.some((v) => {
					const ts = Date.parse(v.value ?? '');
					if (Number.isNaN(ts)) return false;
					if (fromTs !== null && !Number.isNaN(fromTs) && ts < fromTs) return false;
					if (toTs !== null && !Number.isNaN(toTs) && ts > toTs) return false;
					return true;
				});
			}

			return true;
		}

		case 'created':
		case 'updated': {
			const iso = clause.field === 'created' ? instance.created : instance.updated;
			const ts = Date.parse(iso);
			if (Number.isNaN(ts)) return false;

			if (clause.op === 'between') {
				if (clause.from) {
					const fromTs = Date.parse(clause.from);
					if (!Number.isNaN(fromTs) && ts < fromTs) return false;
				}
				if (clause.to) {
					const toTs = Date.parse(clause.to);
					if (!Number.isNaN(toTs) && ts > toTs) return false;
				}
				return true;
			}

			const cutoff = ctx.now.getTime() - clause.days * 86_400_000;
			return clause.op === 'older_than_days' ? ts < cutoff : ts > cutoff;
		}

		case 'created_by':
			if (clause.values.length === 0) return true;
			return clause.values.includes(instance.created_by);
	}
}

/**
 * Multi-choice fields store their value as a JSON-encoded array; single-
 * value fields store a plain string. A clause's `values` matches if any of
 * the stored picks is in the list.
 */
function fieldValueInList(stored: string, wanted: string[]): boolean {
	if (!stored) return false;
	if (stored.startsWith('[')) {
		try {
			const parsed = JSON.parse(stored);
			if (Array.isArray(parsed))
				return parsed.some((p) => wanted.includes(String(p)));
		} catch {}
	}
	return wanted.includes(stored);
}
