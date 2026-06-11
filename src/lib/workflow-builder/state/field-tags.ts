/**
 * Field tag operations (tools_field_tags) — at most one record per workflow,
 * mapping semantic tag types onto field ids.
 */

import { generateId, deepEqual } from '../utils';
import type { ToolsFieldTag, TagMapping, TrackedFieldTag } from '../types';
import { applyUpdate } from './tracked';
import type { WorkflowBuilderState } from '../state.svelte';

/** Get the field tag record for this workflow (there is at most one). */
export function getFieldTagForWorkflow(state: WorkflowBuilderState): TrackedFieldTag | undefined {
	return state.fieldTags.find(
		(ft) => ft.status !== 'deleted' && ft.data.workflow_id === state.workflowId
	);
}

/**
 * Get or create the field tag record for this workflow.
 * Ensures exactly one record exists.
 */
export function getOrCreateFieldTag(state: WorkflowBuilderState): ToolsFieldTag {
	const existing = getFieldTagForWorkflow(state);
	if (existing) return existing.data;

	const newFieldTag: ToolsFieldTag = {
		id: generateId(),
		workflow_id: state.workflowId,
		tag_mappings: []
	};

	state.fieldTags.push({
		data: newFieldTag,
		status: 'new'
	});

	return newFieldTag;
}

/** Update the entire field tag record. */
export function updateFieldTag(
	state: WorkflowBuilderState,
	id: string,
	updates: Partial<ToolsFieldTag>
): void {
	const ft = state.fieldTags.find((t) => t.data.id === id);
	if (!ft) return;
	applyUpdate(ft, updates);
}

/**
 * Set (or clear) a tag mapping for a given tag type.
 * If fieldId is null, removes the mapping for that tag type.
 */
export function setTagMapping(
	state: WorkflowBuilderState,
	tagType: string,
	fieldId: string | null,
	config?: Record<string, unknown>
): void {
	const fieldTag = getOrCreateFieldTag(state);
	const ft = state.fieldTags.find((t) => t.data.id === fieldTag.id)!;

	// Remove existing mapping for this tag type
	ft.data.tag_mappings = ft.data.tag_mappings.filter((m) => m.tagType !== tagType);

	// Add new mapping if fieldId or config provided (config alone = stage mode)
	if (fieldId || config) {
		ft.data.tag_mappings.push({
			tagType,
			fieldId,
			config: config ?? {}
		});
	}

	if (ft.status === 'unchanged') {
		if (!deepEqual(ft.data, ft.original)) {
			ft.status = 'modified';
		}
	}
}

/** Get the current mapping for a tag type, if any. */
export function getTagMapping(
	state: WorkflowBuilderState,
	tagType: string
): TagMapping | undefined {
	const ft = getFieldTagForWorkflow(state);
	if (!ft) return undefined;
	return ft.data.tag_mappings.find((m) => m.tagType === tagType);
}

/**
 * Delete the field tag record for this workflow.
 * If it was never saved (status 'new'), removes it from the array.
 * Otherwise marks it as 'deleted' for the save to pick up.
 */
export function deleteFieldTag(state: WorkflowBuilderState): void {
	const ft = getFieldTagForWorkflow(state);
	if (!ft) return;

	if (ft.status === 'new') {
		state.fieldTags = state.fieldTags.filter((t) => t.data.id !== ft.data.id);
	} else {
		ft.status = 'deleted';
	}
}

/** Update the config for an existing tag mapping. */
export function updateTagMappingConfig(
	state: WorkflowBuilderState,
	tagType: string,
	config: Record<string, unknown>
): void {
	const ft = getFieldTagForWorkflow(state);
	if (!ft) return;

	const mapping = ft.data.tag_mappings.find((m) => m.tagType === tagType);
	if (!mapping) return;

	mapping.config = config;

	if (ft.status === 'unchanged') {
		if (!deepEqual(ft.data, ft.original)) {
			ft.status = 'modified';
		}
	}
}
