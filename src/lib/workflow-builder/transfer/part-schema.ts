/**
 * Transfer "parts" — the LLM-authorable, label-based JSON/YAML contract for
 * copying pieces of a workflow in and out of the builder.
 *
 * Design principle: a part is a projection of the *builder's logical model*,
 * NOT of the database. It references every field by its human `label` and every
 * stage by a human `key` — never by an opaque 15-char id. Ids exist only in the
 * DB, and only after a save. On import, labels/keys are resolved (reused or
 * created) by the same `add*` flow a human clicking the builder would trigger.
 *
 * Every part carries a stable `{ ueberblick_part, version }` discriminant so a
 * pasted blob can be routed without guessing, and a future v2 can migrate.
 */
import { z } from 'zod';
import { conditionalLogicSchema } from '$lib/form-engine/conditional-logic';
import type { FieldType, ColumnPosition, FormPage } from '../types';

export const PART_VERSION = 1 as const;

const FIELD_TYPES = [
	'short_text',
	'long_text',
	'number',
	'email',
	'date',
	'file',
	'dropdown',
	'multiple_choice',
	'smart_dropdown',
	'custom_table_selector',
	'instance_reference'
] as const satisfies readonly FieldType[];

const WRITE_MODES = ['singleton', 'observation', 'computed'] as const;

const columnSchema = z.enum(['left', 'right', 'full']) satisfies z.ZodType<ColumnPosition>;

/** Per-page metadata. Identical to the builder's `FormPage`. */
const formPageSchema = z.object({
	page: z.number(),
	title: z.string(),
	description: z.string()
}) satisfies z.ZodType<FormPage>;

/**
 * One field inside a `form` part.
 *
 * `label` is the field's identity: on import it resolves against the workflow's
 * field-def registry (reuse on match, create on miss). Two fields with the same
 * label denote the same def.
 *
 * Cross-references that would otherwise need ids are expressed by label/name:
 *  - `conditional_logic.show_if.field` holds a field LABEL (not an id).
 *  - smart_dropdown `field_options.source_field_label` holds a field LABEL.
 * The exporter rewrites ids → labels; the importer rewrites labels → ids.
 */
export const formPartFieldSchema = z.object({
	label: z.string().min(1),
	type: z.enum(FIELD_TYPES),
	write_mode: z.enum(WRITE_MODES).optional(),
	page: z.number().optional(),
	row: z.number().optional(),
	column: columnSchema.optional(),
	required: z.boolean().optional(),
	placeholder: z.string().nullable().optional(),
	help_text: z.string().nullable().optional(),
	/** Def-level options (dropdown options, date mode, validation, …). May carry
	 *  label-based source references for smart_dropdown — see module docs. */
	field_options: z.record(z.string(), z.unknown()).nullable().optional(),
	validation_rules: z.record(z.string(), z.unknown()).nullable().optional(),
	/** Formula text for computed fields. `{Label}` tokens reference fields by label. */
	compute_expression: z.string().optional(),
	/** Per-form visibility. `field` props reference other fields by label. */
	conditional_logic: conditionalLogicSchema.nullable().optional()
});

export type FormPartField = z.infer<typeof formPartFieldSchema>;

/** A single form with its referenced field defs inlined by label. */
export const formPartSchema = z.object({
	ueberblick_part: z.literal('form'),
	version: z.literal(PART_VERSION),
	name: z.string(),
	pages: z.array(formPageSchema).optional(),
	fields: z.array(formPartFieldSchema)
});

export type FormPart = z.infer<typeof formPartSchema>;

// ---------------------------------------------------------------------------
// Whole-workflow part
//
// Mirrors the DB's unified model: a `field_defs` registry (the source of truth
// for type/options, keyed by label) plus `stages`, `connections`, and `forms`.
// Form fields REFERENCE a def by label and carry only per-form presentation.
// Stages are identified by a human `key`; connections by (from, to, action).
//
// Roles, automations, field-tags and protocol tools are intentionally NOT
// represented in v1 — they stay managed in the builder GUI, and `apply` leaves
// them untouched so a YAML edit can never silently wipe them.
// ---------------------------------------------------------------------------

const stageTypeSchema = z.enum(['start', 'intermediate', 'end']);

const displayConfigSchema = z.object({
	tab: z.string(),
	tabOrder: z.number(),
	row: z.number(),
	column: columnSchema
});

/** Roles are referenced by NAME (project-scoped); never created via YAML. */
const roleNames = z.array(z.string());

/** Button/visual config, shared by connections, forms, edit & protocol tools. */
const visualConfigSchema = z
	.object({
		button_label: z.string().optional(),
		button_color: z.string().optional(),
		button_icon: z.string().optional(),
		requires_confirmation: z.boolean().optional(),
		confirmation_message: z.string().optional()
	})
	.optional();

/** Registry field def (workflow-scoped). Identity = `label`. */
export const workflowFieldDefPartSchema = z.object({
	label: z.string().min(1),
	field_type: z.enum(FIELD_TYPES),
	write_mode: z.enum(WRITE_MODES).optional(),
	output_type: z.enum(['text', 'number', 'date', 'json', '']).optional(),
	field_options: z.record(z.string(), z.unknown()).nullable().optional(),
	validation_rules: z.record(z.string(), z.unknown()).nullable().optional(),
	compute_expression: z.string().optional(),
	view_roles: roleNames.optional(),
	display_config: displayConfigSchema.nullable().optional()
});

export const workflowStagePartSchema = z.object({
	key: z.string().min(1),
	name: z.string(),
	type: stageTypeSchema,
	x: z.number().optional(),
	y: z.number().optional()
});

/** CMMN-style sentry clause: an availability guard on a transition. */
const sentryClausePartSchema = z.object({
	field: z.string().min(1), // field def label
	op: z.enum([
		'equals',
		'not_equals',
		'contains',
		'is_empty',
		'is_not_empty',
		'gt',
		'gte',
		'lt',
		'lte'
	]),
	value: z.string().optional()
});

export const workflowConnectionPartSchema = z.object({
	/** Source stage key, or null for an entry (workflow-start) connection. */
	from: z.string().nullable(),
	to: z.string().min(1),
	action: z.string().min(1),
	button_label: z.string().optional(),
	button_color: z.string().optional(),
	button_icon: z.string().optional(),
	requires_confirmation: z.boolean().optional(),
	confirmation_message: z.string().optional(),
	allowed_roles: roleNames.optional(),
	sentry: z.array(sentryClausePartSchema).optional()
});

/** A form field inside a workflow part: a reference to a def by label + layout. */
export const workflowFormFieldSchema = z.object({
	field: z.string().min(1),
	page: z.number().optional(),
	row: z.number().optional(),
	column: columnSchema.optional(),
	required: z.boolean().optional(),
	placeholder: z.string().nullable().optional(),
	help_text: z.string().nullable().optional(),
	conditional_logic: conditionalLogicSchema.nullable().optional()
});

const formAttachSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('stage'), stage: z.string().min(1) }),
	z.object({
		type: z.literal('connection'),
		from: z.string().nullable(),
		to: z.string().min(1),
		action: z.string().min(1)
	}),
	z.object({ type: z.literal('global') })
]);

export const workflowFormPartSchema = z.object({
	attach: formAttachSchema,
	name: z.string(),
	pages: z.array(formPageSchema).optional(),
	/** Used only for stage/global forms; connection forms inherit from the connection. */
	allowed_roles: roleNames.optional(),
	visual_config: visualConfigSchema,
	fields: z.array(workflowFormFieldSchema)
});

// --- Edit tools ------------------------------------------------------------

export const workflowEditToolPartSchema = z.object({
	attach: formAttachSchema, // stage | connection | global
	name: z.string(),
	edit_mode: z.enum(['form_fields', 'location']),
	/** Field def labels this tool can edit. */
	editable_fields: z.array(z.string()),
	self_edit_roles: roleNames.optional(),
	any_edit_roles: roleNames.optional(),
	visual_config: visualConfigSchema
});

// --- Protocol tools (+ their backing form) ---------------------------------

/** Inline, protocol-only field (never enters the registry). */
const localFieldPartSchema = z.object({
	key: z.string(),
	label: z.string(),
	field_type: z.enum(FIELD_TYPES),
	field_options: z.record(z.string(), z.unknown()).nullable().optional(),
	required: z.boolean().optional(),
	placeholder: z.string().nullable().optional(),
	help_text: z.string().nullable().optional(),
	page: z.number().optional(),
	row_index: z.number().optional(),
	column_position: columnSchema.optional(),
	conditional_logic: conditionalLogicSchema.nullable().optional()
});

const protocolFormPartSchema = z.object({
	name: z.string().optional(),
	pages: z.array(formPageSchema).optional(),
	/** Registry-backed fields, referenced by def label. */
	fields: z.array(workflowFormFieldSchema).optional(),
	/** Protocol-only inline fields. */
	local_fields: z.array(localFieldPartSchema).optional()
});

/** Protocol tools attach to a connection, or to a set of stages (a region). */
const protocolAttachSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('connection'),
		from: z.string().nullable(),
		to: z.string().min(1),
		action: z.string().min(1)
	}),
	z.object({
		type: z.literal('stages'),
		stages: z.array(z.string()),
		is_global: z.boolean().optional()
	})
]);

export const workflowProtocolToolPartSchema = z.object({
	attach: protocolAttachSchema,
	name: z.string(),
	/** Field def labels written by this protocol. */
	editable_fields: z.array(z.string()),
	/** Which editable fields to prefill on each entry — keyed by field label. */
	prefill_config: z.record(z.string(), z.boolean()).optional(),
	allowed_roles: roleNames.optional(),
	visual_config: visualConfigSchema,
	form: protocolFormPartSchema.optional()
});

// --- Automations -----------------------------------------------------------
// trigger_config and steps keep their native shape; field/stage references
// inside them are translated to labels/keys on the way out and back on apply.
// Kept loose so the full structure round-trips without per-field modelling.

export const workflowAutomationPartSchema = z.object({
	name: z.string(),
	trigger_type: z.enum(['on_transition', 'on_field_change', 'scheduled']),
	trigger_config: z.record(z.string(), z.unknown()),
	execution_mode: z.enum(['run_all', 'first_match']),
	steps: z.array(z.record(z.string(), z.unknown())),
	is_enabled: z.boolean()
});

// --- Field tags ------------------------------------------------------------

export const workflowFieldTagPartSchema = z.object({
	tagType: z.string(),
	/** Field def label, or null for stage-based tags. */
	field: z.string().nullable(),
	config: z.record(z.string(), z.unknown())
});

export const workflowPartSchema = z.object({
	ueberblick_part: z.literal('workflow'),
	version: z.literal(PART_VERSION),
	name: z.string(),
	private_instances: z.boolean().optional(),
	visible_to_roles: roleNames.optional(),
	field_defs: z.array(workflowFieldDefPartSchema),
	stages: z.array(workflowStagePartSchema),
	connections: z.array(workflowConnectionPartSchema),
	forms: z.array(workflowFormPartSchema),
	// Sections below are optional: absent = leave those entities untouched;
	// present (even empty) = authoritative (full reconcile, absent = deleted).
	edit_tools: z.array(workflowEditToolPartSchema).optional(),
	protocol_tools: z.array(workflowProtocolToolPartSchema).optional(),
	automations: z.array(workflowAutomationPartSchema).optional(),
	field_tags: z.array(workflowFieldTagPartSchema).optional()
});

export type WorkflowFieldDefPart = z.infer<typeof workflowFieldDefPartSchema>;
export type WorkflowStagePart = z.infer<typeof workflowStagePartSchema>;
export type WorkflowConnectionPart = z.infer<typeof workflowConnectionPartSchema>;
export type WorkflowFormFieldPart = z.infer<typeof workflowFormFieldSchema>;
export type WorkflowFormPart = z.infer<typeof workflowFormPartSchema>;
export type WorkflowEditToolPart = z.infer<typeof workflowEditToolPartSchema>;
export type WorkflowProtocolToolPart = z.infer<typeof workflowProtocolToolPartSchema>;
export type WorkflowAutomationPart = z.infer<typeof workflowAutomationPartSchema>;
export type WorkflowFieldTagPart = z.infer<typeof workflowFieldTagPartSchema>;
export type WorkflowPart = z.infer<typeof workflowPartSchema>;

/**
 * Discriminated union of every transfer part. `field_defs` and `stage_skeleton`
 * slot in here later behind the same `ueberblick_part` discriminant.
 */
export const anyPartSchema = z.discriminatedUnion('ueberblick_part', [
	formPartSchema,
	workflowPartSchema
]);

export type AnyPart = z.infer<typeof anyPartSchema>;

/** Narrow an unknown parsed blob to a known part kind (throws on mismatch). */
export function parseFormPart(value: unknown): FormPart {
	return formPartSchema.parse(value);
}

/** Narrow an unknown parsed blob to a workflow part (throws on mismatch). */
export function parseWorkflowPart(value: unknown): WorkflowPart {
	return workflowPartSchema.parse(value);
}
