/**
 * Pure filter-engine predicate.
 *
 * Takes a ViewDefinition and a context bundle and returns a predicate
 * function that decides whether a workflow instance matches the view.
 * No Svelte dependencies — unit-testable in isolation.
 *
 * Semantics:
 *   - AND across clauses / across top-level scope filters.
 *   - OR within a single `in` clause's `values`.
 *   - Empty `values` on an `in` clause is a no-op (clause skipped), so a
 *     half-built view still shows data.
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
			if (clause.values.length === 0) return true;
			if (instance.workflow_id !== clause.workflow_id) return true;
			const values = ctx.fieldValuesByInstance.get(instance.id) ?? [];
			const matching = values.filter((v) => v.field_key === clause.field_key);
			if (matching.length === 0) return false;
			return matching.some((v) => fieldValueMatches(v.value, clause.values));
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
function fieldValueMatches(stored: string, wanted: string[]): boolean {
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
