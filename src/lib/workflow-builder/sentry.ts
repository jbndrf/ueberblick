/**
 * Connection sentry evaluator (Phase 3 — CMMN-style conditional connections).
 *
 * A sentry is an AND-ed list of `SentryClause`s on a workflow_connection.
 * `connectionIsAvailable` returns true when:
 *   - the sentry is empty/null (always available — today's behavior), OR
 *   - every clause matches the latest field value for its `field_def_id`.
 *
 * For observation-mode fields, "latest" means the most recent `recorded_at`.
 * Pre-existing role gating (`connection.allowed_roles`) is orthogonal and
 * checked separately by the caller.
 *
 * Pure function; no Svelte, no IDB, no PB. Unit-testable.
 */

import type {
	FieldValue,
	SentryClause,
	WorkflowConnection
} from '$lib/participant-state/types';

export interface SentryContext {
	/** field_def_id -> all values for that field on the instance */
	fieldValuesByDefId: Map<string, FieldValue[]>;
}

export function connectionIsAvailable(
	connection: Pick<WorkflowConnection, 'sentry'>,
	ctx: SentryContext
): boolean {
	const sentry = connection.sentry;
	if (!sentry || sentry.length === 0) return true;

	for (const clause of sentry) {
		if (!clauseMatches(clause, ctx)) return false;
	}
	return true;
}

function clauseMatches(clause: SentryClause, ctx: SentryContext): boolean {
	const rows = ctx.fieldValuesByDefId.get(clause.field_def_id) ?? [];
	const latest = latestRow(rows);
	const stored = latest?.value ?? '';

	switch (clause.op) {
		case 'is_empty':
			return stored.length === 0;
		case 'is_not_empty':
			return stored.length > 0;
		case 'equals':
			return stored === (clause.value ?? '');
		case 'not_equals':
			return stored !== (clause.value ?? '');
		case 'contains':
			return stored.toLowerCase().includes((clause.value ?? '').toLowerCase());
		case 'gt':
		case 'gte':
		case 'lt':
		case 'lte': {
			const a = Number(stored);
			const b = Number(clause.value);
			if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
			if (clause.op === 'gt') return a > b;
			if (clause.op === 'gte') return a >= b;
			if (clause.op === 'lt') return a < b;
			return a <= b;
		}
	}
}

function latestRow(rows: FieldValue[]): FieldValue | undefined {
	if (rows.length <= 1) return rows[0];
	let latest = rows[0];
	for (let i = 1; i < rows.length; i++) {
		const a = Date.parse(rows[i].recorded_at ?? rows[i].updated ?? rows[i].created ?? '');
		const b = Date.parse(latest.recorded_at ?? latest.updated ?? latest.created ?? '');
		if (!Number.isNaN(a) && (Number.isNaN(b) || a > b)) latest = rows[i];
	}
	return latest;
}
