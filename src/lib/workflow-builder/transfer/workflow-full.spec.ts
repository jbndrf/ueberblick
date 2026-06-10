import { describe, it, expect } from 'vitest';
import { WorkflowBuilderState } from '../state.svelte';
import { buildWorkflowPart, applyWorkflowPart, type Role } from './workflow-part';
import { stringifyPart, parsePart } from './serde';
import type {
	WorkflowStage,
	WorkflowConnection,
	ToolsForm,
	ToolsFormField,
	WorkflowFieldDef,
	ToolsEdit,
	ToolsProtocol,
	ToolsAutomation,
	ToolsFieldTag,
	ProtocolLocalFieldDef
} from '../types';

const WF = 'wf000000000001';
const S1 = 'stage000000001';
const S2 = 'stage000000002';
const C_ENTRY = 'conn0000000001';
const C_T = 'conn0000000002';
const FORM = 'form0000000001';
const PFORM = 'form0000000002';
const D_TITLE = 'deftitle0000001';
const D_STATUS = 'defstatus000001';
const E1 = 'edit0000000001';
const PT1 = 'proto000000001';
const A1 = 'auto0000000001';
const FT1 = 'ftag0000000001';
const ROLES: Role[] = [
	{ id: 'role0000000001', name: 'Prüfer' },
	{ id: 'role0000000002', name: 'Bauleiter' }
];

function stage(
	id: string,
	name: string,
	type: WorkflowStage['stage_type'],
	x: number
): WorkflowStage {
	return {
		id,
		workflow_id: WF,
		stage_name: name,
		stage_type: type,
		stage_order: 0,
		position_x: x,
		position_y: 100
	};
}
function def(
	id: string,
	label: string,
	type: WorkflowFieldDef['field_type'],
	extra: Partial<WorkflowFieldDef> = {}
): WorkflowFieldDef {
	return {
		id,
		workflow_id: WF,
		label,
		field_type: type,
		write_mode: 'singleton',
		output_type: '',
		display_config: null,
		view_roles: [],
		validation_rules: null,
		field_options: null,
		compute_expression: '',
		compute_depends_on: [],
		...extra
	};
}
function ref(
	id: string,
	formId: string,
	defId: string,
	label: string,
	type: ToolsFormField['field_type'],
	row: number
): ToolsFormField {
	return {
		id,
		form_id: formId,
		field_def_id: defId,
		field_label: label,
		field_type: type,
		field_order: row,
		page: 1,
		row_index: row,
		column_position: 'full',
		is_required: false,
		placeholder: '',
		help_text: '',
		conditional_logic: null
	};
}

const localField: ProtocolLocalFieldDef = {
	key: 'note',
	label: 'Notiz',
	field_type: 'short_text',
	field_options: null,
	required: false,
	placeholder: null,
	help_text: null,
	page: 1,
	row_index: 0,
	column_position: 'full',
	conditional_logic: null
};

function buildState(): WorkflowBuilderState {
	const s = new WorkflowBuilderState(WF);
	const connections: WorkflowConnection[] = [
		{
			id: C_ENTRY,
			workflow_id: WF,
			from_stage_id: null,
			to_stage_id: S1,
			action_name: 'entry',
			visual_config: { button_label: 'Start' }
		},
		{
			id: C_T,
			workflow_id: WF,
			from_stage_id: S1,
			to_stage_id: S2,
			action_name: 'submit',
			visual_config: { button_label: 'Submit' },
			allowed_roles: ['role0000000002'],
			sentry: [{ field_def_id: D_STATUS, op: 'equals', value: 'High' }]
		}
	];
	const forms: ToolsForm[] = [
		{ id: FORM, workflow_id: WF, connection_id: C_T, name: 'Intake', pages: [] },
		{
			id: PFORM,
			workflow_id: WF,
			stage_id: S1,
			name: 'Protokoll Form',
			pages: [],
			local_fields: [localField]
		}
	];
	const editTools: ToolsEdit[] = [
		{
			id: E1,
			workflow_id: WF,
			stage_id: [S1],
			name: 'Bearbeiten',
			editable_fields: [D_TITLE],
			edit_mode: 'form_fields',
			is_global: false,
			self_edit_roles: [],
			any_edit_roles: ['role0000000001'],
			visual_config: { button_label: 'Edit' }
		}
	];
	const protocolTools: ToolsProtocol[] = [
		{
			id: PT1,
			workflow_id: WF,
			stage_id: [S1],
			is_global: false,
			name: 'Protokoll',
			editable_fields: [D_TITLE],
			prefill_config: { [D_TITLE]: true },
			protocol_form_id: PFORM,
			allowed_roles: [],
			visual_config: { button_label: 'Protocol' }
		}
	];
	const automations: ToolsAutomation[] = [
		{
			id: A1,
			workflow_id: WF,
			name: 'Auto-Status',
			trigger_type: 'on_transition',
			trigger_config: { from_stage_id: S1, to_stage_id: S2 },
			execution_mode: 'run_all',
			is_enabled: true,
			steps: [
				{
					name: 'step',
					conditions: {
						operator: 'AND',
						conditions: [
							{
								type: 'field_value',
								params: { field_key: D_STATUS, operator: 'equals', value: 'High' }
							}
						]
					},
					actions: [{ type: 'set_field_value', params: { field_key: D_TITLE, value: 'x' } }]
				}
			]
		}
	];
	const fieldTags: ToolsFieldTag[] = [
		{
			id: FT1,
			workflow_id: WF,
			tag_mappings: [{ tagType: 'filterable', fieldId: D_STATUS, config: {} }]
		}
	];

	s.initFromServer({
		workflow: { id: WF, private_instances: false, visible_to_roles: ['role0000000001'] },
		workflowName: 'My Workflow',
		stages: [stage(S1, 'Intake', 'start', 100), stage(S2, 'Review', 'intermediate', 400)],
		connections,
		forms,
		formFields: [
			ref('ref00000000001', FORM, D_TITLE, 'Title', 'short_text', 0),
			ref('refp000000001', PFORM, D_TITLE, 'Title', 'short_text', 0)
		],
		fieldDefs: [
			def(D_TITLE, 'Title', 'short_text', { view_roles: ['role0000000001'] }),
			def(D_STATUS, 'Status', 'dropdown', { field_options: { options: [{ label: 'High' }] } })
		],
		editTools,
		protocolTools,
		automations,
		fieldTags
	});
	return s;
}

describe('full workflow part — serialize', () => {
	it('captures every configurable section by name/label', () => {
		const part = buildWorkflowPart(buildState(), { roles: ROLES });
		expect(part.connections.find((c) => c.action === 'submit')?.allowed_roles).toEqual([
			'Bauleiter'
		]);
		expect(part.connections.find((c) => c.action === 'submit')?.sentry).toEqual([
			{ field: 'Status', op: 'equals', value: 'High' }
		]);
		expect(part.field_defs.find((d) => d.label === 'Title')?.view_roles).toEqual(['Prüfer']);
		expect(part.visible_to_roles).toEqual(['Prüfer']);
		expect(part.edit_tools?.[0]).toMatchObject({
			name: 'Bearbeiten',
			editable_fields: ['Title'],
			any_edit_roles: ['Prüfer']
		});
		expect(part.protocol_tools?.[0]).toMatchObject({
			name: 'Protokoll',
			editable_fields: ['Title'],
			prefill_config: { Title: true }
		});
		expect(part.protocol_tools?.[0].form?.local_fields?.[0].key).toBe('note');
		expect(part.automations?.[0].name).toBe('Auto-Status');
		// automation refs are labels/keys, not ids
		const blob = JSON.stringify(part.automations);
		expect(blob).not.toContain(D_STATUS);
		expect(blob).not.toContain(S1);
		expect(part.field_tags).toEqual([{ tagType: 'filterable', field: 'Status', config: {} }]);
		// no opaque ids anywhere
		const all = JSON.stringify(part);
		for (const id of [S1, S2, D_TITLE, D_STATUS, E1, PT1, A1, FT1, 'role0000000001'])
			expect(all).not.toContain(id);
	});

	it('round-trips through YAML', () => {
		const part = buildWorkflowPart(buildState(), { roles: ROLES });
		expect(parsePart(stringifyPart(part))).toEqual(part);
	});
});

describe('full workflow part — idempotency (no data loss)', () => {
	it('re-applying an unedited full export changes nothing', () => {
		const s = buildState();
		expect(s.isDirty).toBe(false);
		const part = buildWorkflowPart(s, { roles: ROLES });
		const { warnings } = applyWorkflowPart(s, part, { roles: ROLES });
		expect(warnings).toEqual([]);
		const c = s.getChanges();
		for (const k of [
			'stages',
			'connections',
			'forms',
			'formFields',
			'fieldDefs',
			'editTools',
			'protocolTools',
			'automations',
			'fieldTags'
		] as const) {
			expect({ section: k, ...c[k] }).toMatchObject({
				section: k,
				new: [],
				modified: [],
				deleted: []
			});
		}
		expect(s.isDirty).toBe(false);
	});
});

describe('full workflow part — reconcile new sections', () => {
	it('adds an automation and an edit tool from edited YAML', () => {
		const s = buildState();
		const part = buildWorkflowPart(s, { roles: ROLES });
		// Automation trigger_config keeps native keys; values are labels/keys.
		part.automations!.push({
			name: 'New Auto',
			trigger_type: 'on_field_change',
			trigger_config: { stage_id: 'review', field_key: 'Status' },
			execution_mode: 'first_match',
			steps: [],
			is_enabled: false
		});
		part.edit_tools!.push({
			attach: { type: 'global' },
			name: 'Global Edit',
			edit_mode: 'location',
			editable_fields: []
		});

		const { warnings } = applyWorkflowPart(s, part, { roles: ROLES });
		expect(warnings).toEqual([]);
		const auto = s.visibleAutomations.find((a) => a.data.name === 'New Auto');
		expect(auto).toBeTruthy();
		// field/stage labels resolved back to ids
		expect((auto!.data.trigger_config as { field_key?: string }).field_key).toBe(D_STATUS);
		expect(s.visibleEditTools.some((e) => e.data.name === 'Global Edit' && e.data.is_global)).toBe(
			true
		);
	});

	it('deletes a protocol tool removed from YAML', () => {
		const s = buildState();
		const part = buildWorkflowPart(s, { roles: ROLES });
		part.protocol_tools = [];
		applyWorkflowPart(s, part, { roles: ROLES });
		expect(s.visibleProtocolTools).toHaveLength(0);
	});

	it('does not inject a Submit button on stage forms, and keeps the protocol backing form detached', () => {
		const s = new WorkflowBuilderState('wffresh00000001');
		s.initFromServer({ workflow: { id: 'wffresh00000001' }, stages: [], connections: [] });
		const { warnings } = applyWorkflowPart(s, {
			ueberblick_part: 'workflow',
			version: 1,
			name: 'T',
			field_defs: [
				{ label: 'Foo', field_type: 'short_text', field_options: {}, validation_rules: {} }
			],
			stages: [
				{ key: 's1', name: 'S1', type: 'start', x: 0, y: 0 },
				{ key: 's2', name: 'S2', type: 'intermediate', x: 100, y: 0 }
			],
			connections: [
				{ from: null, to: 's1', action: 'start' },
				{ from: 's1', to: 's2', action: 'submit' }
			],
			forms: [
				{ attach: { type: 'stage', stage: 's1' }, name: 'StageForm', fields: [{ field: 'Foo' }] }
			],
			protocol_tools: [
				{
					attach: { type: 'connection', from: 's1', to: 's2', action: 'submit' },
					name: 'Proto',
					editable_fields: ['Foo'],
					form: { fields: [{ field: 'Foo' }], local_fields: [] }
				}
			]
		});
		expect(warnings).toEqual([]);
		// Stage form: no spurious { button_label: 'Submit' } from addForm's default.
		const stageForm = s.visibleForms.find((f) => f.data.name === 'StageForm')!.data;
		expect(stageForm.visual_config?.button_label).toBeUndefined();
		// Protocol backing form is detached (no connection_id) and excluded from lists.
		const backing = s.visibleForms.find((f) => f.data.name === 'Proto Form')!.data;
		expect(backing.connection_id).toBeFalsy();
		expect(backing.stage_id).toBeFalsy();
		expect(backing.visual_config?.button_label).toBeUndefined();
	});

	it('leaves tools untouched when their section is absent', () => {
		const s = buildState();
		const part = buildWorkflowPart(s, { roles: ROLES });
		delete part.automations;
		delete part.protocol_tools;
		applyWorkflowPart(s, part, { roles: ROLES });
		expect(s.visibleAutomations).toHaveLength(1);
		expect(s.visibleProtocolTools).toHaveLength(1);
	});
});
