import { describe, expect, it } from 'vitest';
import type { FieldValue, SentryClause } from '$lib/participant-state/types';
import { connectionIsAvailable } from './sentry';

function fv(overrides: Partial<FieldValue> & { value: string }): FieldValue {
	return {
		id: 'fv',
		instance_id: 'i1',
		field_def_id: 'fd_decision',
		write_mode: 'singleton',
		file_value: '',
		recorded_at: '2026-04-10T12:00:00Z',
		recorded_by_action: '',
		recorded_at_stage: '',
		created: '',
		updated: '',
		...overrides
	};
}

function ctx(rows: FieldValue[]) {
	const map = new Map<string, FieldValue[]>();
	for (const r of rows) {
		const arr = map.get(r.field_def_id) ?? [];
		arr.push(r);
		map.set(r.field_def_id, arr);
	}
	return { fieldValuesByDefId: map };
}

describe('connectionIsAvailable', () => {
	it('empty sentry → always available', () => {
		expect(connectionIsAvailable({ sentry: null }, ctx([]))).toBe(true);
		expect(connectionIsAvailable({ sentry: [] }, ctx([]))).toBe(true);
	});

	it('equals match on singleton', () => {
		const sentry: SentryClause[] = [
			{ field_def_id: 'fd_decision', op: 'equals', value: 'approved' }
		];
		expect(
			connectionIsAvailable({ sentry }, ctx([fv({ value: 'approved' })]))
		).toBe(true);
		expect(
			connectionIsAvailable({ sentry }, ctx([fv({ value: 'declined' })]))
		).toBe(false);
	});

	it('AND across clauses', () => {
		const sentry: SentryClause[] = [
			{ field_def_id: 'fd_decision', op: 'equals', value: 'approved' },
			{ field_def_id: 'fd_severity', op: 'gte', value: '3' }
		];
		const ok = ctx([
			fv({ value: 'approved' }),
			fv({ id: 'fv2', field_def_id: 'fd_severity', value: '5' })
		]);
		expect(connectionIsAvailable({ sentry }, ok)).toBe(true);

		const failOnSecond = ctx([
			fv({ value: 'approved' }),
			fv({ id: 'fv2', field_def_id: 'fd_severity', value: '1' })
		]);
		expect(connectionIsAvailable({ sentry }, failOnSecond)).toBe(false);
	});

	it('observation: uses latest by recorded_at', () => {
		const sentry: SentryClause[] = [
			{ field_def_id: 'fd_decision', op: 'equals', value: 'approved' }
		];
		const observations = ctx([
			fv({
				id: 'old',
				write_mode: 'observation',
				value: 'declined',
				recorded_at: '2026-04-01T00:00:00Z'
			}),
			fv({
				id: 'new',
				write_mode: 'observation',
				value: 'approved',
				recorded_at: '2026-04-15T00:00:00Z'
			})
		]);
		expect(connectionIsAvailable({ sentry }, observations)).toBe(true);
	});

	it('is_empty / is_not_empty', () => {
		const empty: SentryClause[] = [{ field_def_id: 'fd_decision', op: 'is_empty' }];
		const notEmpty: SentryClause[] = [{ field_def_id: 'fd_decision', op: 'is_not_empty' }];
		expect(connectionIsAvailable({ sentry: empty }, ctx([]))).toBe(true);
		expect(connectionIsAvailable({ sentry: empty }, ctx([fv({ value: 'x' })]))).toBe(false);
		expect(connectionIsAvailable({ sentry: notEmpty }, ctx([]))).toBe(false);
		expect(connectionIsAvailable({ sentry: notEmpty }, ctx([fv({ value: 'x' })]))).toBe(true);
	});

	it('numeric comparisons', () => {
		const sentry: SentryClause[] = [{ field_def_id: 'fd_n', op: 'gt', value: '10' }];
		expect(
			connectionIsAvailable({ sentry }, ctx([fv({ field_def_id: 'fd_n', value: '15' })]))
		).toBe(true);
		expect(
			connectionIsAvailable({ sentry }, ctx([fv({ field_def_id: 'fd_n', value: '5' })]))
		).toBe(false);
	});
});
