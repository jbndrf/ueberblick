/**
 * Automation operations (tools_automation).
 */

import { generateId } from '../utils';
import type { ToolsAutomation, TriggerType, TriggerConfig } from '../types';
import { applyUpdate } from './tracked';
import type { WorkflowBuilderState } from '../state.svelte';

export function addAutomation(
	state: WorkflowBuilderState,
	triggerType: TriggerType = 'on_transition'
): ToolsAutomation {
	const defaultConfig: TriggerConfig =
		triggerType === 'on_transition'
			? { from_stage_id: null, to_stage_id: null }
			: triggerType === 'on_field_change'
				? { stage_id: null, field_key: null }
				: { cron: '0 2 * * 1-5', target_stage_id: null };

	const newAutomation: ToolsAutomation = {
		id: generateId(),
		workflow_id: state.workflowId,
		name: 'New Automation',
		trigger_type: triggerType,
		trigger_config: defaultConfig,
		execution_mode: 'run_all',
		steps: [{ name: 'Step 1', conditions: null, actions: [] }],
		is_enabled: true
	};

	state.automations.push({
		data: newAutomation,
		status: 'new'
	});

	return newAutomation;
}

export function updateAutomation(
	state: WorkflowBuilderState,
	id: string,
	updates: Partial<ToolsAutomation>
): void {
	const automation = state.automations.find((a) => a.data.id === id);
	if (!automation) return;
	applyUpdate(automation, updates);
}

export function deleteAutomation(state: WorkflowBuilderState, id: string): void {
	const automation = state.automations.find((a) => a.data.id === id);
	if (!automation) return;

	if (automation.status === 'new') {
		state.automations = state.automations.filter((a) => a.data.id !== id);
	} else {
		automation.status = 'deleted';
	}
}
