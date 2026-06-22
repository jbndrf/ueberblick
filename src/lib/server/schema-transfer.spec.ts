import { describe, it, expect } from 'vitest';
import {
	remapSentry,
	remapRefConfig,
	remapPrefillConfig,
	remapFieldOptions,
	resolveRolesByName,
	type IdMaps
} from './schema-transfer';

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

describe('remapFieldOptions', () => {
	const maps: IdMaps = {
		workflow_field_defs: new Map([['old_src', 'new_src']]),
		workflow_stages: new Map([['old_stage', 'new_stage']]),
		custom_tables: new Map([['old_tbl', 'new_tbl']]),
		marker_categories: new Map([['old_cat', 'new_cat']]),
		roles: new Map([
			['old_r1', 'new_r1'],
			['old_r2', 'new_r2']
		])
	};

	it('remaps smart_dropdown source_field and source_stage_id', () => {
		const rec = {
			field_type: 'smart_dropdown',
			field_options: { source_field: 'old_src', source_stage_id: 'old_stage', mappings: [] }
		};
		expect(remapFieldOptions(rec, maps).field_options).toMatchObject({
			source_field: 'new_src',
			source_stage_id: 'new_stage',
			mappings: []
		});
	});

	it('remaps custom_table_selector table/category ids and role arrays', () => {
		const rec = {
			field_type: 'custom_table_selector',
			field_options: {
				source_type: 'custom_table',
				custom_table_id: 'old_tbl',
				display_field: 'Name',
				value_field: 'Code',
				allowed_roles: ['old_r1', 'old_r2'],
				allow_multiple: true
			}
		};
		expect(remapFieldOptions(rec, maps).field_options).toMatchObject({
			source_type: 'custom_table',
			custom_table_id: 'new_tbl',
			display_field: 'Name', // column name, untouched
			value_field: 'Code', // column name, untouched
			allowed_roles: ['new_r1', 'new_r2'],
			allow_multiple: true
		});
	});

	it('remaps the self-assign role arrays (self/any_select_roles) and marker_category_id', () => {
		const rec = {
			field_type: 'custom_table_selector',
			field_options: {
				source_type: 'marker_category',
				marker_category_id: 'old_cat',
				self_select_roles: ['old_r1'],
				any_select_roles: ['old_r2']
			}
		};
		expect(remapFieldOptions(rec, maps).field_options).toMatchObject({
			marker_category_id: 'new_cat',
			self_select_roles: ['new_r1'],
			any_select_roles: ['new_r2']
		});
	});

	it('leaves unknown ids and other field types untouched', () => {
		// unknown ids pass through (same-project duplication has no project maps)
		const rec = {
			field_type: 'custom_table_selector',
			field_options: { custom_table_id: 'x', allowed_roles: ['y'] }
		};
		expect(remapFieldOptions(rec, {}).field_options).toMatchObject({
			custom_table_id: 'x',
			allowed_roles: ['y']
		});
		// non-selector field type returned verbatim
		const text = { field_type: 'short_text', field_options: { placeholder: 'hi' } };
		expect(remapFieldOptions(text, maps)).toBe(text);
		// no field_options
		const empty = { field_type: 'custom_table_selector' };
		expect(remapFieldOptions(empty, maps)).toBe(empty);
	});
});

describe('resolveRolesByName', () => {
	function fakePb(seed: Array<{ id: string; name: string; project_id: string }>) {
		const roles = seed.map((r) => ({ description: null, ...r }));
		return {
			created: [] as any[],
			collection(name: string) {
				if (name !== 'roles') throw new Error(`unexpected collection ${name}`);
				return {
					async getFullList({ filter }: { filter: string }) {
						const pid = /project_id = "([^"]+)"/.exec(filter)?.[1];
						return roles.filter((r) => r.project_id === pid);
					},
					async create(data: any) {
						roles.push(data);
						(this as any)._sink?.push(data);
						return data;
					}
				};
			}
		} as any;
	}

	it('matches existing target roles by name and creates missing ones', async () => {
		const pb = fakePb([
			{ id: 's1', name: 'Inspector', project_id: 'src' },
			{ id: 's2', name: 'Team', project_id: 'src' },
			{ id: 't1', name: 'Inspector', project_id: 'tgt' } // already exists in target
		]);
		const map = await resolveRolesByName(pb, 'src', 'tgt');
		// existing match reused
		expect(map.get('s1')).toBe('t1');
		// missing role created → mapped to a fresh id (not the source id)
		const created = map.get('s2');
		expect(created).toBeDefined();
		expect(created).not.toBe('s2');
		// every source role is mapped
		expect([...map.keys()].sort()).toEqual(['s1', 's2']);
	});
});
