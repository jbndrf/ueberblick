import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	workflowBuilderServerFailedToCreateRole,
	workflowBuilderServerFailedToLoadWorkflow,
	workflowBuilderServerFailedToSaveWorkflow,
	workflowBuilderServerInvalidChangesFormat,
	workflowBuilderServerNoChangesProvided,
	workflowBuilderServerRoleNameRequired,
	workflowBuilderServerWorkflowNotFound
} from '$lib/paraglide/messages';

// Helper to safely fetch from a collection (returns empty array if collection doesn't exist)
async function safeGetFullList(pb: any, collection: string, options: any) {
	try {
		return await pb.collection(collection).getFullList(options);
	} catch (err: any) {
		// Collection doesn't exist yet - return empty array
		if (err?.status === 404 || err?.message?.includes('Missing collection')) {
			return [];
		}
		throw err;
	}
}

export const load: PageServerLoad = async ({ params, locals: { pbAdmin: pb } }) => {
	const { projectId, workflowId } = params;

	try {
		// Load the workflow
		const workflow = await pb.collection('workflows').getOne(workflowId);

		// Verify workflow belongs to this project
		if (workflow.project_id !== projectId) {
			throw error(404, workflowBuilderServerWorkflowNotFound?.() ?? 'Workflow not found');
		}

		// Load workflow builder data - these collections may not exist yet
		// TODO(field-def-redesign): fetch workflow_field_defs and pass through as
		// `fieldDefs`. The page currently denormalizes ref+def into the legacy
		// `formFields` shape; convert to a proper (refs, defs) pair in a follow-up.
		const [stages, connections, forms, formFieldRefs, fieldDefs, editTools, protocolTools, automations, fieldTags, roles] = await Promise.all([
			safeGetFullList(pb, 'workflow_stages', {
				filter: `workflow_id = "${workflowId}"`,
				sort: 'stage_order'
			}),
			safeGetFullList(pb, 'workflow_connections', {
				filter: `workflow_id = "${workflowId}"`
			}),
			safeGetFullList(pb, 'tools_forms', {
				filter: `workflow_id = "${workflowId}"`,
				sort: 'tool_order'
			}),
			safeGetFullList(pb, 'tools_form_field_refs', {
				sort: 'field_order'
			}),
			safeGetFullList(pb, 'workflow_field_defs', {
				filter: `workflow_id = "${workflowId}"`
			}),
			safeGetFullList(pb, 'tools_edit', {
				sort: 'tool_order'
			}),
			safeGetFullList(pb, 'tools_protocol', {
				filter: `workflow_id = "${workflowId}"`,
				sort: 'tool_order'
			}),
			safeGetFullList(pb, 'tools_automation', {
				filter: `workflow_id = "${workflowId}"`
			}),
			safeGetFullList(pb, 'tools_field_tags', {
				filter: `workflow_id = "${workflowId}"`
			}),
			safeGetFullList(pb, 'roles', {
				filter: `project_id = "${projectId}"`,
				sort: 'name'
			})
		]);

		// Filter form field refs to only those belonging to this workflow's forms
		const formIds = forms.map((f: any) => f.id);
		const workflowFormFieldRefs = formFieldRefs.filter((f: any) => formIds.includes(f.form_id));

		// TODO(field-def-redesign): denormalize def -> ref into the legacy combined
		// shape so the existing builder UI keeps rendering. Replace with a proper
		// (refs, defs) split + fieldDefById Map threaded into child components.
		const defById = new Map<string, any>();
		for (const d of fieldDefs) defById.set(d.id, d);
		const workflowFormFields = workflowFormFieldRefs.map((ref: any) => {
			const def = defById.get(ref.field_def_id) ?? {};
			return {
				...ref,
				field_label: def.label ?? '',
				field_type: def.field_type ?? 'short_text',
				field_options: def.field_options ?? null,
				validation_rules: def.validation_rules ?? null,
				is_required: ref.is_required_override ?? def.is_required ?? false,
				placeholder: ref.placeholder_override || def.placeholder || '',
				help_text: ref.help_text_override || def.help_text || ''
			};
		});

		// Filter edit tools to only those belonging to this workflow's connections or stages
		const connectionIds = connections.map((c: any) => c.id);
		const stageIds = stages.map((s: any) => s.id);
		const workflowEditTools = editTools.filter(
			(e: any) => connectionIds.includes(e.connection_id) ||
				(Array.isArray(e.stage_id) && e.stage_id.some((sid: string) => stageIds.includes(sid)))
		);

		return {
			workflow,
			stages,
			connections,
			forms,
			formFields: workflowFormFields,
			// TODO(field-def-redesign): expose raw refs + defs once UI is migrated.
			formFieldRefs: workflowFormFieldRefs,
			fieldDefs,
			editTools: workflowEditTools,
			protocolTools,
			automations,
			fieldTags,
			roles
		};
	} catch (err: any) {
		if (err?.status === 404) {
			throw error(404, workflowBuilderServerWorkflowNotFound?.() ?? 'Workflow not found');
		}
		console.error('Error loading workflow:', err);
		throw error(500, workflowBuilderServerFailedToLoadWorkflow?.() ?? 'Failed to load workflow');
	}
};

export const actions: Actions = {
	createRole: async ({ request, params, locals: { pbAdmin: pb } }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const name = formData.get('name') as string;

		if (!name) {
			return fail(400, { message: workflowBuilderServerRoleNameRequired?.() ?? 'Role name is required' });
		}

		try {
			const newRole = await pb.collection('roles').create({
				project_id: projectId,
				name: name,
				description: ''
			});

			return { success: true, entity: newRole };
		} catch (err) {
			console.error('Error creating role:', err);
			return fail(500, { message: workflowBuilderServerFailedToCreateRole?.() ?? 'Failed to create role' });
		}
	},

	saveWorkflow: async ({ request, locals: { pbAdmin: pb } }) => {
		const formData = await request.formData();
		const changesJson = formData.get('changes') as string;

		if (!changesJson) {
			return fail(400, { message: workflowBuilderServerNoChangesProvided?.() ?? 'No changes provided' });
		}

		let changes: {
			stages: { new: any[]; modified: any[]; deleted: string[] };
			connections: { new: any[]; modified: any[]; deleted: string[] };
			forms: { new: any[]; modified: any[]; deleted: string[] };
			formFields: { new: any[]; modified: any[]; deleted: string[] };
			editTools: { new: any[]; modified: any[]; deleted: string[] };
			protocolTools?: { new: any[]; modified: any[]; deleted: string[] };
			automations: { new: any[]; modified: any[]; deleted: string[] };
			fieldTags?: { new: any[]; modified: any[]; deleted: string[] };
		};

		try {
			changes = JSON.parse(changesJson);
		} catch {
			return fail(400, { message: workflowBuilderServerInvalidChangesFormat?.() ?? 'Invalid changes format' });
		}

		try {
			const batch = pb.createBatch();

			// 1. Stages
			for (const stage of changes.stages.new) {
				batch.collection('workflow_stages').create(stage);
			}
			for (const stage of changes.stages.modified) {
				batch.collection('workflow_stages').update(stage.id, stage);
			}
			for (const stageId of changes.stages.deleted) {
				batch.collection('workflow_stages').delete(stageId);
			}

			// 2. Connections
			for (const conn of changes.connections.new) {
				batch.collection('workflow_connections').create(conn);
			}
			for (const conn of changes.connections.modified) {
				batch.collection('workflow_connections').update(conn.id, conn);
			}
			for (const connId of changes.connections.deleted) {
				batch.collection('workflow_connections').delete(connId);
			}

			// 3. Forms
			for (const form of changes.forms.new) {
				batch.collection('tools_forms').create(form);
			}
			for (const form of changes.forms.modified) {
				batch.collection('tools_forms').update(form.id, form);
			}
			for (const formId of changes.forms.deleted) {
				batch.collection('tools_forms').delete(formId);
			}

			// 4. Form Fields
			// Each incoming "field" is the denormalized shape (ref + def). Split it
			// into: a `workflow_field_defs` upsert (label/type/options/validation/
			// write_mode/etc.) and a `tools_form_field_refs` upsert (layout +
			// per-form overrides). Definitional rows are written first (synchronously,
			// outside the batch) so the ref rows can FK to a real def id.
			const formFieldsAll = [
				...changes.formFields.new,
				...changes.formFields.modified
			];

			// Resolve workflow_id for each field via its form.
			const formIdsForFields = Array.from(
				new Set(formFieldsAll.map((f) => f.form_id).filter(Boolean))
			);
			const formIdToWorkflowId = new Map<string, string>();
			// New forms (just queued) carry workflow_id on the payload itself.
			for (const f of [...changes.forms.new, ...changes.forms.modified]) {
				if (f?.id && f?.workflow_id) formIdToWorkflowId.set(f.id, f.workflow_id);
			}
			// Anything else: look up.
			const missingFormIds = formIdsForFields.filter((id) => !formIdToWorkflowId.has(id));
			if (missingFormIds.length > 0) {
				const filter = missingFormIds.map((id) => `id = "${id}"`).join(' || ');
				const formsLookup = await pb.collection('tools_forms').getFullList({
					filter,
					fields: 'id,workflow_id',
					requestKey: null
				});
				for (const f of formsLookup) formIdToWorkflowId.set(f.id, (f as any).workflow_id);
			}

			// Helpers ----------------------------------------------------------
			const PB_ID_RE = /^[a-zA-Z0-9]{15}$/;
			const slugify = (s: string): string =>
				(s || 'field')
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '_')
					.replace(/^_+|_+$/g, '')
					.slice(0, 60) || 'field';

			// Per-workflow set of existing keys to avoid duplicates on insert.
			const existingKeysByWorkflow = new Map<string, Set<string>>();
			const ensureKeySet = async (workflowId: string): Promise<Set<string>> => {
				let set = existingKeysByWorkflow.get(workflowId);
				if (set) return set;
				const defs = await pb.collection('workflow_field_defs').getFullList({
					filter: `workflow_id = "${workflowId}"`,
					fields: 'key',
					requestKey: null
				});
				set = new Set<string>(defs.map((d: any) => d.key));
				existingKeysByWorkflow.set(workflowId, set);
				return set;
			};
			const uniqueKey = async (workflowId: string, base: string): Promise<string> => {
				const keys = await ensureKeySet(workflowId);
				let candidate = base;
				let n = 2;
				while (keys.has(candidate)) {
					candidate = `${base}_${n++}`;
				}
				keys.add(candidate);
				return candidate;
			};

			// Extract {field_def_id} refs from a compute expression. Matches the
			// pattern used in pb_hooks/automation.js's expression parser.
			const extractDeps = (expr: string): string[] => {
				if (!expr || typeof expr !== 'string') return [];
				const out: string[] = [];
				const seen = new Set<string>();
				const re = /\{([^}]+)\}/g;
				let m: RegExpExecArray | null;
				while ((m = re.exec(expr)) !== null) {
					const candidate = m[1].trim();
					if (PB_ID_RE.test(candidate) && !seen.has(candidate)) {
						seen.add(candidate);
						out.push(candidate);
					}
				}
				return out;
			};

			const buildDefPayload = (field: any, workflowId: string, key: string) => {
				const writeMode = field.write_mode ?? 'singleton';
				const computeExpression =
					writeMode === 'computed' ? (field.compute_expression ?? '') : '';
				const computeDependsOn =
					writeMode === 'computed' ? extractDeps(computeExpression) : [];
				return {
					workflow_id: workflowId,
					key,
					label: field.field_label ?? 'New Field',
					field_type: field.field_type ?? 'short_text',
					write_mode: writeMode,
					is_required: field.is_required ?? false,
					field_options: field.field_options ?? null,
					validation_rules: field.validation_rules ?? null,
					placeholder: field.placeholder ?? '',
					help_text: field.help_text ?? '',
					compute_expression: computeExpression,
					compute_depends_on: computeDependsOn
				};
			};

			const buildRefPayload = (field: any, fieldDefId: string) => ({
				form_id: field.form_id,
				field_def_id: fieldDefId,
				field_order: field.field_order ?? 0,
				page: field.page ?? 1,
				page_title: field.page_title ?? '',
				row_index: field.row_index ?? 0,
				column_position: field.column_position ?? 0,
				is_required_override: field.is_required_override ?? null,
				placeholder_override: field.placeholder_override ?? '',
				help_text_override: field.help_text_override ?? '',
				conditional_logic: field.conditional_logic ?? null
			});

			// Upsert field defs first (outside batch) so we have real ids for refs.
			// Map of incoming temp/placeholder field_def_id -> real id.
			const defIdResolution = new Map<string, string>();

			// NEW fields: create a def, capture id.
			for (const field of changes.formFields.new) {
				const workflowId = formIdToWorkflowId.get(field.form_id);
				if (!workflowId) {
					throw new Error(`Cannot resolve workflow_id for form ${field.form_id}`);
				}
				const incomingDefId: string | undefined = field.field_def_id;
				const isPlaceholder =
					!incomingDefId ||
					incomingDefId.startsWith('_temp_') ||
					!PB_ID_RE.test(incomingDefId);

				if (isPlaceholder) {
					const baseKey = slugify(field.key || field.field_label || 'field');
					const key = await uniqueKey(workflowId, baseKey);
					const created = await pb
						.collection('workflow_field_defs')
						.create(buildDefPayload(field, workflowId, key));
					if (incomingDefId) defIdResolution.set(incomingDefId, created.id);
					field.field_def_id = created.id;
				} else {
					// Existing def id supplied on a "new" ref: update def, reuse id.
					try {
						const existing = await pb
							.collection('workflow_field_defs')
							.getOne(incomingDefId, { fields: 'key', requestKey: null });
						await pb
							.collection('workflow_field_defs')
							.update(incomingDefId, buildDefPayload(field, workflowId, existing.key));
					} catch {
						// Def missing -> create a new one with a fresh key.
						const baseKey = slugify(field.key || field.field_label || 'field');
						const key = await uniqueKey(workflowId, baseKey);
						const created = await pb
							.collection('workflow_field_defs')
							.create(buildDefPayload(field, workflowId, key));
						defIdResolution.set(incomingDefId, created.id);
						field.field_def_id = created.id;
					}
				}
				batch.collection('tools_form_field_refs').create(buildRefPayload(field, field.field_def_id));
			}

			// MODIFIED fields: update both def + ref.
			for (const field of changes.formFields.modified) {
				const workflowId = formIdToWorkflowId.get(field.form_id);
				if (!workflowId) {
					throw new Error(`Cannot resolve workflow_id for form ${field.form_id}`);
				}
				let defId: string | undefined = field.field_def_id;
				const placeholder =
					!defId || defId.startsWith('_temp_') || !PB_ID_RE.test(defId);

				if (placeholder) {
					// Modified record whose def was never persisted: create it now.
					const baseKey = slugify(field.key || field.field_label || 'field');
					const key = await uniqueKey(workflowId, baseKey);
					const created = await pb
						.collection('workflow_field_defs')
						.create(buildDefPayload(field, workflowId, key));
					if (defId) defIdResolution.set(defId, created.id);
					defId = created.id;
					field.field_def_id = defId;
				} else {
					try {
						const existing = await pb
							.collection('workflow_field_defs')
							.getOne(defId!, { fields: 'key', requestKey: null });
						await pb
							.collection('workflow_field_defs')
							.update(defId!, buildDefPayload(field, workflowId, existing.key));
					} catch {
						const baseKey = slugify(field.key || field.field_label || 'field');
						const key = await uniqueKey(workflowId, baseKey);
						const created = await pb
							.collection('workflow_field_defs')
							.create(buildDefPayload(field, workflowId, key));
						defIdResolution.set(defId!, created.id);
						defId = created.id;
						field.field_def_id = defId;
					}
				}
				batch.collection('tools_form_field_refs').update(field.id, buildRefPayload(field, defId!));
			}

			for (const fieldId of changes.formFields.deleted) {
				batch.collection('tools_form_field_refs').delete(fieldId);
			}

			// 5. Edit Tools
			for (const tool of changes.editTools.new) {
				batch.collection('tools_edit').create(tool);
			}
			for (const tool of changes.editTools.modified) {
				batch.collection('tools_edit').update(tool.id, tool);
			}
			for (const toolId of changes.editTools.deleted) {
				batch.collection('tools_edit').delete(toolId);
			}

			// 6. Protocol Tools
			if (changes.protocolTools) {
				for (const tool of changes.protocolTools.new) {
					batch.collection('tools_protocol').create(tool);
				}
				for (const tool of changes.protocolTools.modified) {
					batch.collection('tools_protocol').update(tool.id, tool);
				}
				for (const toolId of changes.protocolTools.deleted) {
					batch.collection('tools_protocol').delete(toolId);
				}
			}

			// 7. Automations
			if (changes.automations) {
				for (const automation of changes.automations.new) {
					batch.collection('tools_automation').create(automation);
				}
				for (const automation of changes.automations.modified) {
					batch.collection('tools_automation').update(automation.id, automation);
				}
				for (const automationId of changes.automations.deleted) {
					batch.collection('tools_automation').delete(automationId);
				}
			}

			// 7. Field Tags
			if (changes.fieldTags) {
				for (const ft of changes.fieldTags.new) {
					batch.collection('tools_field_tags').create(ft);
				}
				for (const ft of changes.fieldTags.modified) {
					batch.collection('tools_field_tags').update(ft.id, ft);
				}
				for (const ftId of changes.fieldTags.deleted) {
					batch.collection('tools_field_tags').delete(ftId);
				}
			}

			// Execute batch
			await batch.send();

			// Sync entry connection's allowed_roles to workflow.entry_allowed_roles
			// Find entry connection among new + modified connections, or existing ones
			let entryConnection: any = null;

			// Check new connections for entry connection
			entryConnection = changes.connections.new.find((c) => !c.from_stage_id);

			// Check modified connections for entry connection
			if (!entryConnection) {
				entryConnection = changes.connections.modified.find((c) => !c.from_stage_id);
			}

			// If entry connection was found/modified, sync its allowed_roles to workflow
			if (entryConnection) {
				const workflowId = entryConnection.workflow_id;
				const entryAllowedRoles = entryConnection.allowed_roles || [];

				console.log(
					'[saveWorkflow] Syncing entry_allowed_roles:',
					workflowId,
					entryAllowedRoles
				);

				await pb.collection('workflows').update(workflowId, {
					entry_allowed_roles: entryAllowedRoles
				});
			}

			return { success: true };
		} catch (err) {
			console.error('Failed to save workflow:', err);
			return fail(500, { message: workflowBuilderServerFailedToSaveWorkflow?.() ?? 'Failed to save workflow' });
		}
	}
};
