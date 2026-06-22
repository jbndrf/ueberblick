import { describe, it, expect } from 'vitest';
import { remapSentry, remapRefConfig, remapPrefillConfig, type IdMaps } from './schema-transfer';

// old field-def id -> new field-def id, as built during duplication.
const idMaps: IdMaps = {
	workflow_field_defs: new Map([
		['old_status', 'new_status'],
		['old_amount', 'new_amount'],
		['old_kind', 'new_kind']
	])
};

describe('remapSentry', () => {
	it('remaps every clause field_def_id, leaving op/value intact', () => {
		const rec = {
			sentry: [
				{ field_def_id: 'old_status', op: 'equals', value: 'done' },
				{ field_def_id: 'old_amount', op: 'gte', value: '100' },
				{ field_def_id: 'old_status', op: 'is_not_empty' }
			]
		};
		expect(remapSentry(rec, idMaps).sentry).toEqual([
			{ field_def_id: 'new_status', op: 'equals', value: 'done' },
			{ field_def_id: 'new_amount', op: 'gte', value: '100' },
			{ field_def_id: 'new_status', op: 'is_not_empty' }
		]);
	});

	it('passes through empty / missing sentries and unknown ids', () => {
		expect(remapSentry({ sentry: [] }, idMaps).sentry).toEqual([]);
		expect(remapSentry({ sentry: null }, idMaps).sentry).toBeNull();
		expect(remapSentry({}, idMaps)).toEqual({});
		// id with no mapping is left as-is (no crash)
		expect(
			remapSentry({ sentry: [{ field_def_id: 'x', op: 'equals', value: 'y' }] }, idMaps).sentry
		).toEqual([{ field_def_id: 'x', op: 'equals', value: 'y' }]);
	});
});

describe('remapRefConfig — conditional_logic show_if', () => {
	it('remaps a leaf condition field', () => {
		const rec = {
			config: {
				row_index: 0,
				conditional_logic: { show_if: { op: 'includes', field: 'old_kind', value: 'A' } }
			}
		};
		const out = remapRefConfig(rec, idMaps);
		expect(out.config.conditional_logic.show_if).toEqual({
			op: 'includes',
			field: 'new_kind',
			value: 'A'
		});
		expect(out.config.row_index).toBe(0); // other config preserved
	});

	it('remaps nested and/or groups recursively', () => {
		const rec = {
			config: {
				conditional_logic: {
					show_if: {
						op: 'and',
						conds: [
							{ op: 'equals', field: 'old_status', value: 'done' },
							{ op: 'or', conds: [{ op: 'is_empty', field: 'old_amount' }] }
						]
					}
				}
			}
		};
		const out = remapRefConfig(rec, idMaps);
		expect(out.config.conditional_logic.show_if).toEqual({
			op: 'and',
			conds: [
				{ op: 'equals', field: 'new_status', value: 'done' },
				{ op: 'or', conds: [{ op: 'is_empty', field: 'new_amount' }] }
			]
		});
	});

	it('passes through refs with no conditional_logic', () => {
		const rec = { config: { row_index: 1 } };
		expect(remapRefConfig(rec, idMaps)).toEqual(rec);
	});
});

describe('remapPrefillConfig', () => {
	it('remaps the field-def-id KEYS, keeping the boolean values', () => {
		const rec = { prefill_config: { old_status: true, old_amount: false, unknown: true } };
		expect(remapPrefillConfig(rec, idMaps).prefill_config).toEqual({
			new_status: true,
			new_amount: false,
			unknown: true
		});
	});

	it('passes through when absent', () => {
		expect(remapPrefillConfig({}, idMaps)).toEqual({});
	});
});
