import { describe, it, expect } from 'vitest';
import { buildFormPart } from './export-part';
import { stringifyPart, parsePart, parseFormPartText } from './serde';
import { formPartSchema } from './part-schema';
import type { ToolsForm, ToolsFormField } from '../types';

const SEV = 'sevdef000000001';
const SUB = 'subdef000000001';
const NOTE = 'notedef00000001';

function form(): ToolsForm {
	return {
		id: 'form0000000001',
		workflow_id: 'wf000000000001',
		stage_id: 'stage000000001',
		name: 'Inspection',
		pages: [{ page: 1, title: 'Details', description: '' }]
	};
}

function fields(): ToolsFormField[] {
	return [
		{
			id: 'ref00000000001',
			form_id: 'form0000000001',
			field_def_id: SEV,
			field_label: 'Severity',
			field_type: 'dropdown',
			page: 1,
			row_index: 0,
			column_position: 'full',
			is_required: true,
			field_options: { options: [{ label: 'Low' }, { label: 'High' }] }
		},
		{
			id: 'ref00000000002',
			form_id: 'form0000000001',
			field_def_id: SUB,
			field_label: 'Subtype',
			field_type: 'smart_dropdown',
			page: 1,
			row_index: 1,
			column_position: 'full',
			// references Severity by id + a stage id that must NOT survive export
			field_options: {
				source_field: SEV,
				source_stage_id: 'stage000000001',
				mappings: [{ when: 'High', options: [{ label: 'Urgent' }] }]
			}
		},
		{
			id: 'ref00000000003',
			form_id: 'form0000000001',
			field_def_id: NOTE,
			field_label: 'Notes',
			field_type: 'long_text',
			page: 1,
			row_index: 2,
			column_position: 'full',
			conditional_logic: { show_if: { op: 'equals', field: SEV, value: 'High' } }
		}
	];
}

describe('buildFormPart', () => {
	it('emits a valid, id-free form part', () => {
		const part = buildFormPart(form(), fields());
		expect(() => formPartSchema.parse(part)).not.toThrow();
		expect(part.ueberblick_part).toBe('form');
		expect(part.version).toBe(1);
		expect(part.name).toBe('Inspection');
		expect(part.fields).toHaveLength(3);
		// No opaque def ids leak anywhere in the serialized blob.
		const blob = JSON.stringify(part);
		expect(blob).not.toContain(SEV);
		expect(blob).not.toContain(SUB);
		expect(blob).not.toContain(NOTE);
		expect(blob).not.toContain('stage000000001');
	});

	it('rewrites smart_dropdown source_field id -> source_field_label and drops stage id', () => {
		const part = buildFormPart(form(), fields());
		const sub = part.fields.find((f) => f.label === 'Subtype')!;
		expect(sub.field_options?.source_field_label).toBe('Severity');
		expect(sub.field_options?.source_field).toBeUndefined();
		expect(sub.field_options?.source_stage_id).toBeUndefined();
		// mappings are preserved verbatim
		expect((sub.field_options?.mappings as unknown[]).length).toBe(1);
	});

	it('rewrites conditional_logic field id -> label', () => {
		const part = buildFormPart(form(), fields());
		const notes = part.fields.find((f) => f.label === 'Notes')!;
		expect(notes.conditional_logic).toEqual({
			show_if: { op: 'equals', field: 'Severity', value: 'High' }
		});
	});
});

describe('serde', () => {
	it('round-trips a part through YAML', () => {
		const part = buildFormPart(form(), fields());
		const text = stringifyPart(part);
		expect(text).toContain('ueberblick_part: form');
		const back = parsePart(text);
		expect(back).toEqual(part);
	});

	it('accepts JSON too (YAML superset) and validates shape', () => {
		const part = buildFormPart(form(), fields());
		const json = JSON.stringify(part);
		expect(parseFormPartText(json)).toEqual(part);
	});

	it('rejects a non-part blob', () => {
		expect(() => parsePart('hello: world')).toThrow();
	});
});
