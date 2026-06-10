import { describe, it, expect } from 'vitest';
import { WorkflowBuilderState } from '../state.svelte';
import { importFormPart } from './import-part';
import { buildFormPart } from './export-part';
import type { FormPart } from './part-schema';

function freshState(): WorkflowBuilderState {
	const s = new WorkflowBuilderState('wf000000000001');
	s.initFromServer({ workflow: { id: 'wf000000000001' }, stages: [], connections: [] });
	return s;
}

function samplePart(): FormPart {
	return {
		ueberblick_part: 'form',
		version: 1,
		name: 'Inspection',
		pages: [{ page: 1, title: 'Details', description: '' }],
		fields: [
			{
				label: 'Severity',
				type: 'dropdown',
				row: 0,
				column: 'full',
				required: true,
				field_options: { options: [{ label: 'Low' }, { label: 'High' }] }
			},
			{
				label: 'Subtype',
				type: 'smart_dropdown',
				row: 1,
				column: 'full',
				field_options: {
					source_field_label: 'Severity',
					mappings: [{ when: 'High', options: [{ label: 'Urgent' }] }]
				}
			},
			{
				label: 'Notes',
				type: 'long_text',
				row: 2,
				column: 'full',
				conditional_logic: { show_if: { op: 'equals', field: 'Severity', value: 'High' } }
			}
		]
	};
}

function refByLabel(s: WorkflowBuilderState, label: string) {
	return s.formFields.find((f) => f.data.field_label === label);
}

describe('importFormPart', () => {
	it('creates a form and its fields as new items', () => {
		const s = freshState();
		const res = importFormPart(s, samplePart(), { isGlobal: true });

		expect(res.warnings).toHaveLength(0);
		expect(res.created).toBe(3);

		const form = s.visibleForms.find((f) => f.data.id === res.formId);
		expect(form?.data.name).toBe('Inspection');
		expect(form?.status).toBe('new');

		const formFields = s.formFields.filter((f) => f.data.form_id === res.formId);
		expect(formFields).toHaveLength(3);
		expect(formFields.every((f) => f.status === 'new')).toBe(true);
		expect(refByLabel(s, 'Severity')?.data.is_required).toBe(true);
	});

	it('resolves conditional_logic label -> the referenced field def id', () => {
		const s = freshState();
		importFormPart(s, samplePart(), { isGlobal: true });

		const sevDefId = refByLabel(s, 'Severity')?.data.field_def_id;
		const notes = refByLabel(s, 'Notes')?.data;
		expect(sevDefId).toBeTruthy();
		expect(notes?.conditional_logic).toEqual({
			show_if: { op: 'equals', field: sevDefId, value: 'High' }
		});
	});

	it('resolves smart_dropdown source_field_label -> source_field id', () => {
		const s = freshState();
		importFormPart(s, samplePart(), { isGlobal: true });

		const sevDefId = refByLabel(s, 'Severity')?.data.field_def_id;
		const subtype = refByLabel(s, 'Subtype')?.data;
		expect(subtype?.field_options?.source_field).toBe(sevDefId);
		expect(subtype?.field_options?.source_field_label).toBeUndefined();
	});

	it('reuses an existing field def with the same label instead of duplicating', () => {
		const s = freshState();
		const existing = s.addFieldDef({ label: 'Severity', field_type: 'dropdown' });

		importFormPart(s, samplePart(), { isGlobal: true });

		// The imported Severity ref points at the pre-existing def...
		expect(refByLabel(s, 'Severity')?.data.field_def_id).toBe(existing.id);
		// ...and no second def with label "Severity" was created.
		const severityDefs = s.fieldDefs.filter(
			(d) => d.data.label === 'Severity' && d.status !== 'deleted'
		);
		expect(severityDefs).toHaveLength(1);
	});

	it('drops a conditional rule that references an unknown field and warns', () => {
		const s = freshState();
		const part = samplePart();
		part.fields[2].conditional_logic = {
			show_if: { op: 'equals', field: 'Ghost Field', value: 'x' }
		};

		const res = importFormPart(s, part, { isGlobal: true });
		expect(refByLabel(s, 'Notes')?.data.conditional_logic).toBeNull();
		expect(res.warnings.some((w) => w.message.includes('Ghost Field'))).toBe(true);
	});

	it('survives a full export -> import round-trip', () => {
		// Build a part from a first import, re-export it, and import into a clean
		// state — the second form must be structurally identical.
		const s1 = freshState();
		const r1 = importFormPart(s1, samplePart(), { isGlobal: true });
		const form1 = s1.visibleForms.find((f) => f.data.id === r1.formId)!.data;
		const fields1 = s1.formFields.filter((f) => f.data.form_id === r1.formId).map((f) => f.data);

		const reExported = buildFormPart(form1, fields1);

		const s2 = freshState();
		const r2 = importFormPart(s2, reExported, { isGlobal: true });
		expect(r2.warnings).toHaveLength(0);
		expect(r2.created).toBe(3);

		const sevDefId = refByLabel(s2, 'Severity')?.data.field_def_id;
		expect(refByLabel(s2, 'Subtype')?.data.field_options?.source_field).toBe(sevDefId);
		expect(refByLabel(s2, 'Notes')?.data.conditional_logic).toEqual({
			show_if: { op: 'equals', field: sevDefId, value: 'High' }
		});
	});
});
