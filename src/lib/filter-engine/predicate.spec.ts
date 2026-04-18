import { describe, expect, it } from 'vitest';
import type {
	FieldValue,
	ViewDefinition,
	WorkflowInstance
} from '$lib/participant-state/types';
import { buildPredicate } from './predicate';

function instance(overrides: Partial<WorkflowInstance> = {}): WorkflowInstance {
	return {
		id: 'i1',
		workflow_id: 'wf1',
		current_stage_id: 'stageA',
		status: 'active',
		created_by: 'pJan',
		geometry: null,
		centroid: null,
		bbox: null,
		files: [],
		created: '2026-04-10T12:00:00Z',
		updated: '2026-04-10T12:00:00Z',
		...overrides
	};
}

function emptyView(overrides: Partial<ViewDefinition> = {}): ViewDefinition {
	return {
		version: 1,
		workflow_ids: [],
		category_ids: [],
		clauses: [],
		...overrides
	};
}

const now = new Date('2026-04-17T12:00:00Z');

describe('buildPredicate', () => {
	it('empty view matches everything', () => {
		const pred = buildPredicate(emptyView(), {
			now,
			fieldValuesByInstance: new Map()
		});
		expect(pred(instance())).toBe(true);
	});

	it('workflow_ids scope limits by workflow', () => {
		const pred = buildPredicate(emptyView({ workflow_ids: ['wfX'] }), {
			now,
			fieldValuesByInstance: new Map()
		});
		expect(pred(instance({ workflow_id: 'wf1' }))).toBe(false);
		expect(pred(instance({ workflow_id: 'wfX' }))).toBe(true);
	});

	it('stage clause: OR within values, skipped if values empty', () => {
		const pred = buildPredicate(
			emptyView({
				clauses: [
					{ field: 'stage', workflow_id: 'wf1', op: 'in', values: ['stageA', 'stageB'] }
				]
			}),
			{ now, fieldValuesByInstance: new Map() }
		);
		expect(pred(instance({ current_stage_id: 'stageA' }))).toBe(true);
		expect(pred(instance({ current_stage_id: 'stageB' }))).toBe(true);
		expect(pred(instance({ current_stage_id: 'stageC' }))).toBe(false);

		const noop = buildPredicate(
			emptyView({
				clauses: [{ field: 'stage', workflow_id: 'wf1', op: 'in', values: [] }]
			}),
			{ now, fieldValuesByInstance: new Map() }
		);
		expect(noop(instance({ current_stage_id: 'stageC' }))).toBe(true);
	});

	it('stage clause does not match instances from a different workflow', () => {
		const pred = buildPredicate(
			emptyView({
				clauses: [{ field: 'stage', workflow_id: 'wf1', op: 'in', values: ['stageA'] }]
			}),
			{ now, fieldValuesByInstance: new Map() }
		);
		// Different workflow → clause does not apply, instance passes.
		expect(pred(instance({ workflow_id: 'wf2', current_stage_id: 'stageZ' }))).toBe(
			true
		);
	});

	it('AND across different clauses', () => {
		const pred = buildPredicate(
			emptyView({
				clauses: [
					{ field: 'stage', workflow_id: 'wf1', op: 'in', values: ['stageA'] },
					{ field: 'created_by', op: 'in', values: ['pJan'] }
				]
			}),
			{ now, fieldValuesByInstance: new Map() }
		);
		expect(pred(instance())).toBe(true);
		expect(pred(instance({ created_by: 'pOther' }))).toBe(false);
		expect(pred(instance({ current_stage_id: 'stageB' }))).toBe(false);
	});

	it('field_value clause: single + multi-choice', () => {
		const values: FieldValue[] = [
			{
				id: 'fv1',
				instance_id: 'i1',
				field_key: 'damage_type',
				value: '["xyz","abc"]',
				file_value: '',
				stage_id: '',
				created_by_action: '',
				created: '',
				updated: ''
			}
		];
		const map = new Map([['i1', values]]);

		const pred = buildPredicate(
			emptyView({
				clauses: [
					{
						field: 'field_value',
						workflow_id: 'wf1',
						field_key: 'damage_type',
						op: 'in',
						values: ['xyz']
					}
				]
			}),
			{ now, fieldValuesByInstance: map }
		);
		expect(pred(instance())).toBe(true);

		const miss = buildPredicate(
			emptyView({
				clauses: [
					{
						field: 'field_value',
						workflow_id: 'wf1',
						field_key: 'damage_type',
						op: 'in',
						values: ['other']
					}
				]
			}),
			{ now, fieldValuesByInstance: map }
		);
		expect(miss(instance())).toBe(false);

		// Instance with no values for the field → miss.
		const missing = buildPredicate(
			emptyView({
				clauses: [
					{
						field: 'field_value',
						workflow_id: 'wf1',
						field_key: 'damage_type',
						op: 'in',
						values: ['xyz']
					}
				]
			}),
			{ now, fieldValuesByInstance: new Map() }
		);
		expect(missing(instance())).toBe(false);
	});

	it('older_than_days and newer_than_days', () => {
		const older = buildPredicate(
			emptyView({
				clauses: [{ field: 'created', op: 'older_than_days', days: 7 }]
			}),
			{ now, fieldValuesByInstance: new Map() }
		);
		expect(older(instance({ created: '2026-04-01T12:00:00Z' }))).toBe(true);
		expect(older(instance({ created: '2026-04-15T12:00:00Z' }))).toBe(false);

		const newer = buildPredicate(
			emptyView({
				clauses: [{ field: 'updated', op: 'newer_than_days', days: 3 }]
			}),
			{ now, fieldValuesByInstance: new Map() }
		);
		expect(newer(instance({ updated: '2026-04-16T12:00:00Z' }))).toBe(true);
		expect(newer(instance({ updated: '2026-04-10T12:00:00Z' }))).toBe(false);
	});

	it('between with open-ended bounds', () => {
		const pred = buildPredicate(
			emptyView({
				clauses: [
					{ field: 'created', op: 'between', from: '2026-04-05T00:00:00Z', to: null }
				]
			}),
			{ now, fieldValuesByInstance: new Map() }
		);
		expect(pred(instance({ created: '2026-04-10T12:00:00Z' }))).toBe(true);
		expect(pred(instance({ created: '2026-04-01T12:00:00Z' }))).toBe(false);
	});

	it('category scope uses the provided workflowCategoryById map', () => {
		const pred = buildPredicate(
			emptyView({ category_ids: ['catA'] }),
			{
				now,
				fieldValuesByInstance: new Map(),
				workflowCategoryById: new Map([
					['wf1', 'catA'],
					['wf2', 'catB']
				])
			}
		);
		expect(pred(instance({ workflow_id: 'wf1' }))).toBe(true);
		expect(pred(instance({ workflow_id: 'wf2' }))).toBe(false);
	});
});
