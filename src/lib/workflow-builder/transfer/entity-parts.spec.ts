import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { WorkflowBuilderState } from '../state.svelte';
import { parseWorkflowPartText } from './serde';
import { applyWorkflowPart } from './workflow-part';
import { serializeEntityPart, applyEntityPart, type YamlEntityKind } from './entity-parts';

const yamlText = readFileSync(
	fileURLToPath(new URL('./__fixtures__/vorlage-generisch.yaml', import.meta.url)),
	'utf8'
);

/** Real modelled workflow as a representative state. */
function seededState(): WorkflowBuilderState {
	const s = new WorkflowBuilderState('wf000000000001');
	s.initFromServer({ workflow: { id: 'wf000000000001' }, stages: [], connections: [] });
	applyWorkflowPart(s, parseWorkflowPartText(yamlText));
	s.markAsSaved();
	return s;
}

describe('entity parts — serialize', () => {
	it('serializes each entity kind to YAML', () => {
		const s = seededState();
		const cases: Array<[YamlEntityKind, string | undefined]> = [
			['stage', s.visibleStages[0]?.data.id],
			['connection', s.visibleConnections.find((c) => c.data.from_stage_id)?.data.id],
			['form', s.visibleForms[0]?.data.id],
			['fieldDef', s.visibleFieldDefs[0]?.data.id]
		];
		for (const [kind, id] of cases) {
			expect(id, `${kind} fixture entity`).toBeTruthy();
			const out = serializeEntityPart(s, [], kind, id!);
			expect(out, kind).toBeTruthy();
			expect(out!.text.length).toBeGreaterThan(0);
			expect(() => parse(out!.text)).not.toThrow();
			// No opaque ids leak into the YAML
			expect(out!.text).not.toContain(id!);
		}
	});

	it('stage YAML carries key/name/type', () => {
		const s = seededState();
		const stage = s.visibleStages[0].data;
		const out = serializeEntityPart(s, [], 'stage', stage.id)!;
		const obj = parse(out.text);
		expect(obj.name).toBe(stage.stage_name);
		expect(obj.type).toBe(stage.stage_type);
		expect(typeof obj.key).toBe('string');
	});
});

describe('entity parts — apply', () => {
	it('re-applying an unedited entity is a no-op', () => {
		const s = seededState();
		const conn = s.visibleConnections.find((c) => c.data.from_stage_id)!.data;
		const out = serializeEntityPart(s, [], 'connection', conn.id)!;
		const res = applyEntityPart(s, [], 'connection', conn.id, out.text);
		expect(res.errors).toEqual([]);
		expect(res.warnings).toEqual([]);
		expect(s.isDirty).toBe(false);
	});

	it('editing a connection adds a sentry clause by field label', () => {
		const s = seededState();
		const conn = s.visibleConnections.find((c) => c.data.from_stage_id)!.data;
		const def = s.visibleFieldDefs[0].data;
		const out = serializeEntityPart(s, [], 'connection', conn.id)!;
		const obj = parse(out.text);
		obj.sentry = [{ field: def.label, op: 'is_not_empty' }];
		// JSON is valid YAML — good enough for the apply path.
		const res = applyEntityPart(s, [], 'connection', conn.id, JSON.stringify(obj));
		expect(res.errors).toEqual([]);
		const updated = s.getConnectionById(conn.id)!.data;
		expect(updated.sentry).toEqual([{ field_def_id: def.id, op: 'is_not_empty' }]);
		expect(s.isDirty).toBe(true);
	});

	it('editing a stage name patches the stage in place', () => {
		const s = seededState();
		const stage = s.visibleStages[1].data;
		const out = serializeEntityPart(s, [], 'stage', stage.id)!;
		const obj = parse(out.text);
		obj.name = 'Umbenannt via YAML';
		const res = applyEntityPart(s, [], 'stage', stage.id, JSON.stringify(obj));
		expect(res.errors).toEqual([]);
		expect(s.getStageById(stage.id)!.data.stage_name).toBe('Umbenannt via YAML');
		// In-place update, not recreate
		expect(s.visibleStages.some((x) => x.data.id === stage.id)).toBe(true);
	});

	it('rejects invalid YAML and schema violations with errors', () => {
		const s = seededState();
		const stage = s.visibleStages[0].data;
		const bad = applyEntityPart(s, [], 'stage', stage.id, ':\n  - not: [valid');
		expect(bad.errors.length).toBeGreaterThan(0);

		const wrong = applyEntityPart(s, [], 'stage', stage.id, 'name: 5\ntype: nonsense\nkey: x');
		expect(wrong.errors.length).toBeGreaterThan(0);
		expect(s.isDirty).toBe(false);
	});

	it('form YAML round-trips fields (add one by label)', () => {
		const s = seededState();
		const form = s.visibleForms.find((f) => !s.getProtocolFormIds().has(f.data.id))!.data;
		const def = s.visibleFieldDefs.find(
			(d) => !s.getFieldsForForm(form.id).some((f) => f.data.field_def_id === d.data.id)
		);
		expect(def).toBeTruthy();
		const before = s.getFieldsForForm(form.id).length;
		const out = serializeEntityPart(s, [], 'form', form.id)!;
		const obj = parse(out.text);
		obj.fields.push({ field: def!.data.label, row: 99, column: 'full' });
		const res = applyEntityPart(s, [], 'form', form.id, JSON.stringify(obj));
		expect(res.errors).toEqual([]);
		expect(s.getFieldsForForm(form.id).length).toBe(before + 1);
	});
});
