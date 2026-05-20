/**
 * Form Fill State Management
 *
 * State management and data loading for form filling tools.
 * Handles loading forms from connections, validation, and pagination.
 */

import type { ParticipantGateway } from '$lib/participant-state/gateway.svelte';
import type { Form, FormField, FormValues, FieldError, DateFieldOptions } from '$lib/components/form-renderer/types';

/**
 * Returns true if the participant's roles satisfy the field def's `view_roles`
 * restriction. Empty/missing `view_roles` means no restriction (visible to all
 * who can otherwise see the form).
 */
function canViewFieldDef(def: Record<string, any>, participantRoleIds: string[]): boolean {
	const viewRoles = def?.view_roles;
	if (!Array.isArray(viewRoles) || viewRoles.length === 0) return true;
	return participantRoleIds.some((rid) => viewRoles.includes(rid));
}

/**
 * Join `tools_form_field_refs` + `workflow_field_defs` into the legacy
 * `FormField` render shape. Per-form override fields on the ref win when set.
 * Filters out fields whose def `view_roles` excludes the participant.
 */
async function fetchFormFields(
	gateway: ParticipantGateway,
	formIds: string[],
	participantRoleIds: string[] = []
): Promise<FormField[]> {
	if (formIds.length === 0) return [];
	const refFilter = formIds.map((id) => `form_id = "${id}"`).join(' || ');
	const refs = await gateway.collection('tools_form_field_refs').getFullList({
		filter: refFilter,
		sort: 'field_order'
	}) as Array<Record<string, any>>;
	if (refs.length === 0) return [];
	const defIds = Array.from(new Set(refs.map((r) => r.field_def_id).filter(Boolean)));
	const defFilter = defIds.map((id) => `id = "${id}"`).join(' || ');
	const defs = defFilter
		? (await gateway.collection('workflow_field_defs').getFullList({ filter: defFilter })) as Array<Record<string, any>>
		: [];
	const defById = new Map(defs.map((d) => [d.id, d]));
	return refs
		.filter((ref) => {
			const def = defById.get(ref.field_def_id);
			if (!def) return false;
			return canViewFieldDef(def, participantRoleIds);
		})
		.map((ref) => {
		const def = defById.get(ref.field_def_id) || {};
		const isRequired = ref.is_required_override ?? def.is_required ?? false;
		return {
			id: ref.field_def_id,
			form_id: ref.form_id,
			field_label: def.label ?? '',
			field_type: def.field_type,
			field_order: ref.field_order,
			page: ref.page,
			page_title: ref.page_title,
			row_index: ref.row_index ?? 0,
			column_position: ref.column_position ?? 'full',
			is_required: isRequired,
			placeholder: ref.placeholder_override || def.placeholder,
			help_text: ref.help_text_override || def.help_text,
			validation_rules: def.validation_rules ?? null,
			field_options: def.field_options ?? null,
			conditional_logic: ref.conditional_logic ?? null,
			write_mode: def.write_mode
		} as FormField;
	});
}

// ==========================================================================
// Types
// ==========================================================================

export interface FormFillState {
	form: Form | null;
	fields: FormField[];
	values: FormValues;
	errors: FieldError[];
	currentPage: number;
	isLoading: boolean;
	isSubmitting: boolean;
	loadError: string | null;
	workflowId: string;
	connectionId: string;
}

export interface MultiFormState {
	forms: Form[];
	allFields: FormField[];
	currentFormIndex: number;
	collectedValues: FormValues;
	isLoading: boolean;
	loadError: string | null;
	workflowId: string;
	connectionId: string;
}

// ==========================================================================
// State Creation
// ==========================================================================

function createInitialState(): FormFillState {
	return {
		form: null,
		fields: [],
		values: {},
		errors: [],
		currentPage: 1,
		isLoading: false,
		isSubmitting: false,
		loadError: null,
		workflowId: '',
		connectionId: ''
	};
}

// ==========================================================================
// Pagination Helpers
// ==========================================================================

export function getTotalPages(state: FormFillState): number {
	if (state.fields.length === 0) return 1;
	return Math.max(...state.fields.map(f => f.page || 1));
}

export function getCurrentPageFields(state: FormFillState): FormField[] {
	return state.fields
		.filter(f => (f.page || 1) === state.currentPage)
		.sort((a, b) => {
			if (a.row_index !== b.row_index) {
				return a.row_index - b.row_index;
			}
			const posOrder: Record<string, number> = { left: 0, right: 1, full: 2 };
			return (posOrder[a.column_position] || 0) - (posOrder[b.column_position] || 0);
		});
}

export function getCurrentPageTitle(state: FormFillState): string {
	const fields = getCurrentPageFields(state);
	const firstFieldWithTitle = fields.find(f => f.page_title);
	return firstFieldWithTitle?.page_title || `Page ${state.currentPage}`;
}

/**
 * Distinct pages present in the form, ascending. Title falls back to "Page N"
 * when no field on the page carries a `page_title`. fieldIds enables per-tab
 * error counts without re-walking state.fields.
 */
export function getPages(
	state: FormFillState
): Array<{ page: number; title: string; fieldIds: string[] }> {
	const byPage = new Map<number, { title: string | null; fieldIds: string[] }>();
	for (const f of state.fields) {
		const p = f.page || 1;
		const entry = byPage.get(p) ?? { title: null, fieldIds: [] };
		entry.fieldIds.push(f.id);
		if (!entry.title && f.page_title) entry.title = f.page_title;
		byPage.set(p, entry);
	}
	return Array.from(byPage.entries())
		.sort(([a], [b]) => a - b)
		.map(([page, { title, fieldIds }]) => ({
			page,
			title: title || `Page ${page}`,
			fieldIds
		}));
}

/**
 * Count of validation errors per page, used to badge tabs.
 */
export function errorsByPage(state: FormFillState): Map<number, number> {
	const pageOf = new Map<string, number>();
	for (const f of state.fields) pageOf.set(f.id, f.page || 1);
	const counts = new Map<number, number>();
	for (const err of state.errors) {
		const p = pageOf.get(err.fieldId);
		if (p === undefined) continue;
		counts.set(p, (counts.get(p) ?? 0) + 1);
	}
	return counts;
}

/**
 * Submit-filter predicate. A value is "meaningful" (should be persisted)
 * when it isn't null/undefined, isn't an empty string, and isn't pure
 * whitespace. Centralised so all submission paths share semantics.
 *
 * Note: empty arrays / empty objects currently pass through (they may carry
 * meaning for some field types, e.g. cleared multi-selects). Revisit if
 * empty arrays start producing unwanted `"[]"` rows.
 */
export function isMeaningfulValue(value: unknown): boolean {
	if (value === null || value === undefined) return false;
	if (typeof value === 'string') return value.trim() !== '';
	return true;
}

export function getCurrentPageRows(state: FormFillState): Array<{ rowIndex: number; fields: FormField[] }> {
	const pageFields = getCurrentPageFields(state);
	const rowMap = new Map<number, FormField[]>();

	for (const field of pageFields) {
		const rowIndex = field.row_index;
		if (!rowMap.has(rowIndex)) {
			rowMap.set(rowIndex, []);
		}
		rowMap.get(rowIndex)!.push(field);
	}

	return Array.from(rowMap.entries())
		.sort(([a], [b]) => a - b)
		.map(([rowIndex, fields]) => ({
			rowIndex,
			fields: fields.sort((a, b) => {
				const posOrder: Record<string, number> = { left: 0, right: 1, full: 2 };
				return (posOrder[a.column_position] || 0) - (posOrder[b.column_position] || 0);
			})
		}));
}

export function canGoNext(state: FormFillState): boolean {
	return state.currentPage < getTotalPages(state);
}

export function canGoPrevious(state: FormFillState): boolean {
	return state.currentPage > 1;
}

export function getFieldError(state: FormFillState, fieldId: string): string | undefined {
	return state.errors.find(e => e.fieldId === fieldId)?.message;
}

// ==========================================================================
// Validation
// ==========================================================================

function validateField(field: FormField, value: unknown): string | null {
	// Required check
	if (field.is_required) {
		if (value === null || value === undefined || value === '') {
			return 'This field is required';
		}
		if (Array.isArray(value) && value.length === 0) {
			return 'This field is required';
		}
	}

	if (value === null || value === undefined || value === '') {
		return null;
	}

	const rules = field.validation_rules;
	if (!rules) return null;

	if (typeof value === 'string') {
		if (rules.minLength && value.length < rules.minLength) {
			return `Minimum ${rules.minLength} characters required`;
		}
		if (rules.maxLength && value.length > rules.maxLength) {
			return `Maximum ${rules.maxLength} characters allowed`;
		}
		if (rules.pattern) {
			const regex = new RegExp(rules.pattern);
			if (!regex.test(value)) {
				return 'Invalid format';
			}
		}
	}

	if (typeof value === 'number') {
		if (rules.min !== undefined && value < rules.min) {
			return `Minimum value is ${rules.min}`;
		}
		if (rules.max !== undefined && value > rules.max) {
			return `Maximum value is ${rules.max}`;
		}
	}

	if (Array.isArray(value)) {
		if (rules.minSelections && value.length < rules.minSelections) {
			return `Select at least ${rules.minSelections} options`;
		}
		if (rules.maxSelections && value.length > rules.maxSelections) {
			return `Select at most ${rules.maxSelections} options`;
		}
	}

	if (field.field_type === 'email' && typeof value === 'string') {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(value)) {
			return 'Invalid email address';
		}
	}

	return null;
}

export function validatePage(state: FormFillState, page: number): FieldError[] {
	const pageFields = state.fields.filter(f => (f.page || 1) === page);
	const newErrors: FieldError[] = [];

	for (const field of pageFields) {
		const value = state.values[field.id];
		const error = validateField(field, value);
		if (error) {
			newErrors.push({ fieldId: field.id, message: error });
		}
	}

	return newErrors;
}

export function validateAll(state: FormFillState): FieldError[] {
	const newErrors: FieldError[] = [];

	for (const field of state.fields) {
		const value = state.values[field.id];
		const error = validateField(field, value);
		if (error) {
			newErrors.push({ fieldId: field.id, message: error });
		}
	}

	return newErrors;
}

// ==========================================================================
// Value Initialization
// ==========================================================================

function initializeValues(fields: FormField[]): FormValues {
	const initialValues: FormValues = {};

	for (const field of fields) {
		if (field.field_type === 'date') {
			const dateOpts = field.field_options as DateFieldOptions | null;
			if (dateOpts?.prefill_now) {
				const now = new Date();
				const mode = dateOpts.date_mode || 'date';

				if (mode === 'time') {
					initialValues[field.id] = now.toTimeString().slice(0, 5);
				} else if (mode === 'datetime') {
					initialValues[field.id] = now.toISOString().slice(0, 16);
				} else {
					initialValues[field.id] = now.toISOString().slice(0, 10);
				}
			}
		}
	}

	return initialValues;
}

// ==========================================================================
// Data Loading - Single Form (legacy, for backward compat)
// ==========================================================================

/**
 * Load entry form for a workflow (entry = connection with empty from_stage_id)
 * Note: This loads only the first form. Use loadConnectionForms for multi-form support.
 */
export async function loadEntryForm(
	gateway: ParticipantGateway,
	workflowId: string,
	participantRoleIds: string[] = []
): Promise<FormFillState> {
	const state = createInitialState();
	state.isLoading = true;
	state.workflowId = workflowId;

	try {
		// Find the entry connection (from_stage_id is empty)
		const connections = await gateway.collection('workflow_connections').getFullList({
			filter: `workflow_id = "${workflowId}" && from_stage_id = ""`
		});

		if (connections.length === 0) {
			state.loadError = 'No entry connection found for this workflow';
			state.isLoading = false;
			return state;
		}

		const entryConnection = connections[0] as { id: string };
		state.connectionId = entryConnection.id;

		// Find the form attached to this connection
		const forms = await gateway.collection('tools_forms').getFullList({
			filter: `connection_id = "${entryConnection.id}"`,
			sort: 'created'
		});

		if (forms.length === 0) {
			// No form - workflow can be started without entry data
			state.isLoading = false;
			return state;
		}

		state.form = forms[0] as unknown as Form;

		// Load form fields (join refs + defs)
		state.fields = await fetchFormFields(gateway, [state.form.id], participantRoleIds);
		state.values = initializeValues(state.fields);
		state.isLoading = false;

		return state;
	} catch (err) {
		console.error('Failed to load entry form:', err);
		state.loadError = err instanceof Error ? err.message : 'Failed to load form';
		state.isLoading = false;
		return state;
	}
}

/**
 * Load form for a specific connection (for tool flow from existing instance)
 * Note: This loads only the first form. Use loadConnectionForms for multi-form support.
 */
export async function loadConnectionForm(
	gateway: ParticipantGateway,
	workflowId: string,
	connectionId: string,
	participantRoleIds: string[] = []
): Promise<FormFillState> {
	const state = createInitialState();
	state.isLoading = true;
	state.workflowId = workflowId;
	state.connectionId = connectionId;

	try {
		// Find the form attached to this connection
		const forms = await gateway.collection('tools_forms').getFullList({
			filter: `connection_id = "${connectionId}"`,
			sort: 'created'
		});

		if (forms.length === 0) {
			// No form for this connection
			state.isLoading = false;
			return state;
		}

		state.form = forms[0] as unknown as Form;

		// Load form fields (join refs + defs)
		state.fields = await fetchFormFields(gateway, [state.form.id], participantRoleIds);
		state.values = initializeValues(state.fields);
		state.isLoading = false;

		return state;
	} catch (err) {
		console.error('Failed to load connection form:', err);
		state.loadError = err instanceof Error ? err.message : 'Failed to load form';
		state.isLoading = false;
		return state;
	}
}

// ==========================================================================
// Data Loading - Multi-Form Support
// ==========================================================================

export interface LoadedFormsData {
	forms: Form[];
	fields: FormField[];
	connectionId: string;
}

/**
 * Load all forms for a connection (supports multiple forms)
 * Returns forms ordered by created date
 */
export async function loadConnectionForms(
	gateway: ParticipantGateway,
	connectionId: string,
	participantRoleIds: string[] = []
): Promise<LoadedFormsData> {
	// Load all forms for this connection, ordered by created
	const forms = await gateway.collection('tools_forms').getFullList({
		filter: `connection_id = "${connectionId}"`,
		sort: 'created'
	}) as unknown as Form[];

	if (forms.length === 0) {
		return { forms: [], fields: [], connectionId };
	}

	// Load fields for all forms (join refs + defs)
	const fields = await fetchFormFields(gateway, forms.map((f) => f.id), participantRoleIds);

	return { forms, fields, connectionId };
}

/**
 * Load entry connection and its forms for a workflow
 */
export async function loadEntryForms(
	gateway: ParticipantGateway,
	workflowId: string,
	participantRoleIds: string[] = []
): Promise<LoadedFormsData & { toStageId: string }> {
	// Find the entry connection (from_stage_id is empty)
	const connections = await gateway.collection('workflow_connections').getFullList({
		filter: `workflow_id = "${workflowId}" && from_stage_id = ""`
	});

	if (connections.length === 0) {
		throw new Error('No entry connection found for this workflow');
	}

	const entryConnection = connections[0] as { id: string; to_stage_id: string };
	const data = await loadConnectionForms(gateway, entryConnection.id, participantRoleIds);

	return { ...data, toStageId: entryConnection.to_stage_id };
}

/**
 * Get fields for a specific form
 */
export function getFieldsForForm(allFields: FormField[], formId: string): FormField[] {
	return allFields.filter(f => f.form_id === formId);
}

/**
 * Initialize values for a set of fields
 */
export function initializeFieldValues(fields: FormField[]): FormValues {
	return initializeValues(fields);
}
