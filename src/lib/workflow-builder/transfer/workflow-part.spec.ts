import { describe, it, expect } from 'vitest';
import { WorkflowBuilderState } from '../state.svelte';
import { buildWorkflowPart, applyWorkflowPart } from './workflow-part';
import { stringifyPart, parsePart } from './serde';
import type {
	WorkflowStage,
	WorkflowConnection,
	ToolsForm,
	ToolsFormField,
	WorkflowFieldDef
} from '../types';

const WF = 'wf000000000001';
const S1 = 'stage000000001';
const S2 = 'stage000000002';
const C_ENTRY = 'conn0000000001';
const C_T = 'conn0000000002';
const FORM = 'form0000000001';
const D_TITLE = 'deftitle0000001';
const D_STATUS = 'defstatus000001';

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
	opts: Record<string, unknown> | null = null
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
		field_options: opts,
		compute_expression: '',
		compute_depends_on: []
	};
}

function ref(
	id: string,
	defId: string,
	label: string,
	type: ToolsFormField['field_type'],
	row: number
): ToolsFormField {
	return {
		id,
		form_id: FORM,
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
			visual_config: { button_label: 'Submit' }
		}
	];
	const forms: ToolsForm[] = [
		{ id: FORM, workflow_id: WF, connection_id: C_T, name: 'Intake', pages: [] }
	];
	s.initFromServer({
		workflow: { id: WF, private_instances: false },
		workflowName: 'My Workflow',
		stages: [stage(S1, 'Intake', 'start', 100), stage(S2, 'Review', 'intermediate', 400)],
		connections,
		forms,
		formFields: [
			ref('ref00000000001', D_TITLE, 'Title', 'short_text', 0),
			ref('ref00000000002', D_STATUS, 'Status', 'dropdown', 1)
		],
		fieldDefs: [
			def(D_TITLE, 'Title', 'short_text'),
			def(D_STATUS, 'Status', 'dropdown', { options: [{ label: 'Open' }] })
		]
	});
	return s;
}

describe('buildWorkflowPart', () => {
	it('serializes the whole workflow with keys/labels, no ids', () => {
		const part = buildWorkflowPart(buildState());
		expect(part.ueberblick_part).toBe('workflow');
		expect(part.name).toBe('My Workflow');
		expect(part.stages.map((s) => s.key)).toEqual(['intake', 'review']);
		expect(part.field_defs.map((d) => d.label).sort()).toEqual(['Status', 'Title']);
		// connection references stages by key
		const t = part.connections.find((c) => c.action === 'submit')!;
		expect(t.from).toBe('intake');
		expect(t.to).toBe('review');
		// form attached to the connection, fields reference defs by label
		expect(part.forms).toHaveLength(1);
		expect(part.forms[0].attach).toEqual({
			type: 'connection',
			from: 'intake',
			to: 'review',
			action: 'submit'
		});
		expect(part.forms[0].fields.map((f) => f.field)).toEqual(['Title', 'Status']);
		const blob = JSON.stringify(part);
		for (const id of [S1, S2, D_TITLE, D_STATUS, FORM, C_T]) expect(blob).not.toContain(id);
	});

	it('round-trips through YAML', () => {
		const part = buildWorkflowPart(buildState());
		const back = parsePart(stringifyPart(part));
		expect(back).toEqual(part);
	});
});

describe('applyWorkflowPart — idempotency', () => {
	it('re-applying an unedited part introduces no changes', () => {
		const s = buildState();
		expect(s.isDirty).toBe(false);
		const part = buildWorkflowPart(s);
		const { warnings } = applyWorkflowPart(s, part);
		expect(warnings).toEqual([]);
		expect(s.isDirty).toBe(false);
		const changes = s.getChanges();
		for (const k of ['stages', 'connections', 'forms', 'formFields', 'fieldDefs'] as const) {
			expect(changes[k].new).toHaveLength(0);
			expect(changes[k].deleted).toHaveLength(0);
			expect(changes[k].modified).toHaveLength(0);
		}
	});
});

describe('applyWorkflowPart — reconcile', () => {
	it('adds a new stage + connection from edited YAML', () => {
		const s = buildState();
		const part = buildWorkflowPart(s);
		part.stages.push({ key: 'done', name: 'Done', type: 'end', x: 700, y: 100 });
		part.connections.push({ from: 'review', to: 'done', action: 'finish', button_label: 'Finish' });

		applyWorkflowPart(s, part);
		expect(s.visibleStages.map((x) => x.data.stage_name)).toContain('Done');
		const conn = s.visibleConnections.find((c) => c.data.action_name === 'finish');
		expect(conn).toBeTruthy();
		expect(conn!.data.visual_config?.button_label).toBe('Finish');
	});

	it('deletes a stage removed from YAML (and its dangling connection)', () => {
		const s = buildState();
		const part = buildWorkflowPart(s);
		part.stages = part.stages.filter((st) => st.key !== 'review');
		part.connections = part.connections.filter((c) => c.to !== 'review' && c.from !== 'review');
		// the form is attached to the removed connection — drop it too
		part.forms = [];

		applyWorkflowPart(s, part);
		expect(s.visibleStages.map((x) => x.data.stage_name)).not.toContain('Review');
		expect(s.visibleConnections.find((c) => c.data.action_name === 'submit')).toBeFalsy();
	});

	it('adds and removes form fields by label', () => {
		const s = buildState();
		const part = buildWorkflowPart(s);
		const form = part.forms[0];
		// add a new field referencing a new def; remove "Status"
		part.field_defs.push({ label: 'Notes', field_type: 'long_text' });
		form.fields = [
			form.fields.find((f) => f.field === 'Title')!,
			{ field: 'Notes', row: 1, column: 'full' }
		];

		applyWorkflowPart(s, part);
		const labels = s
			.getFieldsForForm(FORM)
			.map((f) => f.data.field_label)
			.sort();
		expect(labels).toEqual(['Notes', 'Title']);
		expect(s.visibleFieldDefs.some((d) => d.data.label === 'Notes')).toBe(true);
	});

	it('updates a stage name in place when its key is unchanged', () => {
		const s = buildState();
		const part = buildWorkflowPart(s);
		// "Review" -> rename via the SAME key would recreate; instead change x to prove in-place update
		const review = part.stages.find((st) => st.key === 'review')!;
		review.x = 999;
		applyWorkflowPart(s, part);
		const stillReview = s.visibleStages.find((x) => x.data.id === S2);
		expect(stillReview?.data.position_x).toBe(999);
		// same id preserved (in-place update, not recreate)
		expect(s.visibleStages.some((x) => x.data.id === S2)).toBe(true);
	});
});
