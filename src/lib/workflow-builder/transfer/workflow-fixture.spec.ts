import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WorkflowBuilderState } from '../state.svelte';
import { parseWorkflowPartText } from './serde';
import { applyWorkflowPart, buildWorkflowPart } from './workflow-part';

const yamlText = readFileSync(
	fileURLToPath(new URL('./__fixtures__/vorlage-generisch.yaml', import.meta.url)),
	'utf8'
);

function freshState() {
	const s = new WorkflowBuilderState('wf000000000001');
	s.initFromServer({ workflow: { id: 'wf000000000001' }, stages: [], connections: [] });
	return s;
}

describe('whole-workflow YAML — real modelled process', () => {
	it('parses a real, hand-modelled workflow YAML', () => {
		const part = parseWorkflowPartText(yamlText);
		expect(part.ueberblick_part).toBe('workflow');
		expect(part.name).toBe('Vorlage (generisch)');
		expect(part.stages).toHaveLength(7);
		expect(part.field_defs.length).toBeGreaterThan(10);
		expect(part.forms.length).toBe(3);
	});

	it('applies into a fresh workflow without errors', () => {
		const s = freshState();
		const part = parseWorkflowPartText(yamlText);
		const { warnings } = applyWorkflowPart(s, part);

		expect(warnings).toEqual([]);
		expect(s.visibleStages).toHaveLength(7);
		// one entry connection ("anlegen") + 8 transitions = 9
		expect(s.visibleConnections).toHaveLength(9);
		expect(s.visibleStages.find((x) => x.data.stage_type === 'start')?.data.stage_name).toBe(
			'Vorbereitung'
		);

		// conditional logic resolved label -> a real def id
		const sonderDefId = s.visibleFieldDefs.find((d) => d.data.label === 'Sonderfälle')?.data.id;
		const statusField = s.formFields.find(
			(f) => f.data.field_label === 'Status Sonderfall 1'
		)?.data;
		expect(statusField?.conditional_logic).toEqual({
			show_if: { op: 'includes', field: sonderDefId, value: 'Sonderfall 1' }
		});
	});

	it('round-trips: apply then re-serialize is stable (no second-apply changes)', () => {
		const s = freshState();
		applyWorkflowPart(s, parseWorkflowPartText(yamlText));
		s.markAsSaved();
		// Re-applying the serialization of the now-saved state is a no-op.
		const part2 = buildWorkflowPart(s);
		const { warnings } = applyWorkflowPart(s, part2);
		expect(warnings).toEqual([]);
		const c = s.getChanges();
		for (const k of ['stages', 'connections', 'forms', 'formFields', 'fieldDefs'] as const) {
			expect(c[k].new).toHaveLength(0);
			expect(c[k].deleted).toHaveLength(0);
			expect(c[k].modified).toHaveLength(0);
		}
	});
});
