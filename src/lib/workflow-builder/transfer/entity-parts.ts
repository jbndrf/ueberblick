/**
 * Per-entity YAML parts — the inspector's YAML toggle.
 *
 * An entity part IS the entity's entry inside the whole-workflow part
 * (same schema fragments from part-schema.ts, same natural keys). Apply
 * works by rebuilding the current whole-workflow part, swapping in the
 * edited entry and running the idempotent `applyWorkflowPart` reconcile:
 * unedited entries are no-ops, the edited entity (incl. its children —
 * form fields, sentry clauses, automation steps) gets patched in place.
 *
 * Identity fields (stage key, connection from/to/action, names/labels)
 * double as match keys — editing them re-creates the entity under the new
 * identity, exactly like the whole-workflow code view.
 */

import { parse, stringify } from 'yaml';
import { z, type ZodType } from 'zod';
import type { WorkflowBuilderState } from '../state.svelte';
import { buildWorkflowPart, applyWorkflowPart, type Role } from './workflow-part';
import {
	workflowStagePartSchema,
	workflowConnectionPartSchema,
	workflowFormPartSchema,
	workflowEditToolPartSchema,
	workflowProtocolToolPartSchema,
	workflowAutomationPartSchema,
	workflowFieldDefPartSchema,
	workflowFieldTagPartSchema,
	type WorkflowPart
} from './part-schema';

/** Selection types that have a YAML representation. */
export type YamlEntityKind =
	| 'stage'
	| 'connection'
	| 'form'
	| 'editTool'
	| 'protocolTool'
	| 'automation'
	| 'fieldDef'
	| 'fieldTags';

type SectionKey = keyof Pick<
	WorkflowPart,
	| 'stages'
	| 'connections'
	| 'forms'
	| 'edit_tools'
	| 'protocol_tools'
	| 'automations'
	| 'field_defs'
	| 'field_tags'
>;

const SECTION_SCHEMAS: Record<SectionKey, ZodType> = {
	stages: workflowStagePartSchema,
	connections: workflowConnectionPartSchema,
	forms: workflowFormPartSchema,
	edit_tools: workflowEditToolPartSchema,
	protocol_tools: workflowProtocolToolPartSchema,
	automations: workflowAutomationPartSchema,
	field_defs: workflowFieldDefPartSchema,
	field_tags: z.array(workflowFieldTagPartSchema)
};

/**
 * Locate the part-section + index for an entity id. Index positions mirror
 * the `state.visible*` source orders used by buildWorkflowPart; forms skip
 * protocol-backing forms (those serialize nested in their protocol tool).
 */
function locate(
	state: WorkflowBuilderState,
	kind: YamlEntityKind,
	id: string
): { section: SectionKey; index: number } | null {
	switch (kind) {
		case 'stage':
			return {
				section: 'stages',
				index: state.visibleStages.findIndex((s) => s.data.id === id)
			};
		case 'connection':
			return {
				section: 'connections',
				index: state.visibleConnections.findIndex((c) => c.data.id === id)
			};
		case 'form': {
			// Protocol-backing forms serialize nested inside their protocol tool.
			const owner = state.visibleProtocolTools.find((p) => p.data.protocol_form_id === id);
			if (owner) {
				return {
					section: 'protocol_tools',
					index: state.visibleProtocolTools.findIndex((p) => p.data.id === owner.data.id)
				};
			}
			const protocolFormIds = state.getProtocolFormIds();
			const regularForms = state.visibleForms.filter((f) => !protocolFormIds.has(f.data.id));
			return { section: 'forms', index: regularForms.findIndex((f) => f.data.id === id) };
		}
		case 'editTool':
			return {
				section: 'edit_tools',
				index: state.visibleEditTools.findIndex((t) => t.data.id === id)
			};
		case 'protocolTool':
			return {
				section: 'protocol_tools',
				index: state.visibleProtocolTools.findIndex((t) => t.data.id === id)
			};
		case 'automation':
			return {
				section: 'automations',
				index: state.visibleAutomations.findIndex((a) => a.data.id === id)
			};
		case 'fieldDef':
			return {
				section: 'field_defs',
				index: state.visibleFieldDefs.findIndex((d) => d.data.id === id)
			};
		case 'fieldTags':
			// Whole array — the record is a workflow-wide singleton.
			return { section: 'field_tags', index: -2 };
	}
}

export interface EntityYaml {
	text: string;
	section: SectionKey;
}

/** Serialize one entity (incl. nested children) to YAML. */
export function serializeEntityPart(
	state: WorkflowBuilderState,
	roles: Role[],
	kind: YamlEntityKind,
	id: string
): EntityYaml | null {
	const loc = locate(state, kind, id);
	if (!loc || loc.index === -1) return null;
	const whole = buildWorkflowPart(state, { roles });
	const sectionValue = whole[loc.section];
	const entry = loc.index === -2 ? sectionValue : (sectionValue as unknown[])?.[loc.index];
	if (entry === undefined) return null;
	return { text: stringify(entry, { indent: 2 }), section: loc.section };
}

export interface EntityApplyResult {
	warnings: string[];
	errors: string[];
}

/**
 * Validate and apply an edited entity YAML back into the builder state.
 * Children referenced by natural keys (field labels, stage keys, role names)
 * resolve against the current state; unresolvable refs surface as warnings.
 */
export function applyEntityPart(
	state: WorkflowBuilderState,
	roles: Role[],
	kind: YamlEntityKind,
	id: string,
	text: string
): EntityApplyResult {
	const loc = locate(state, kind, id);
	if (!loc || loc.index === -1) {
		return { warnings: [], errors: ['Entity no longer exists.'] };
	}

	let raw: unknown;
	try {
		raw = parse(text);
	} catch (e) {
		return { warnings: [], errors: [`YAML: ${e instanceof Error ? e.message : String(e)}`] };
	}

	const schema = SECTION_SCHEMAS[loc.section];
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return {
			warnings: [],
			errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
		};
	}

	const whole = buildWorkflowPart(state, { roles });
	if (loc.index === -2) {
		(whole as Record<string, unknown>)[loc.section] = parsed.data;
	} else {
		(whole[loc.section] as unknown[])[loc.index] = parsed.data;
	}

	const { warnings } = applyWorkflowPart(state, whole, { roles });
	return { warnings, errors: [] };
}
