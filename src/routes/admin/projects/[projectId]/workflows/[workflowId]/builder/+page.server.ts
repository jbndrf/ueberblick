import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { generateId } from '$lib/server/schema-transfer';
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
		// All project workflows — used by instance_reference field UI to pick a target.
		const projectWorkflows = await pb.collection('workflows').getFullList({
			filter: `project_id = "${projectId}" && is_active = true`,
			fields: 'id, name',
			sort: 'name'
		});

		// Verify workflow belongs to this project
		if (workflow.project_id !== projectId) {
			throw error(404, workflowBuilderServerWorkflowNotFound?.() ?? 'Workflow not found');
		}

		// Load workflow builder data - these collections may not exist yet
		const [
			stages,
			connections,
			forms,
			formFieldRefs,
			fieldDefs,
			editTools,
			protocolTools,
			automations,
			fieldTags,
			roles
		] = await Promise.all([
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
			safeGetFullList(pb, 'tools_form_field_refs', {}),
			safeGetFullList(pb, 'workflow_field_defs', {
				filter: `workflow_id = "${workflowId}"`
			}),
			safeGetFullList(pb, 'tools_edit', {
				filter: `workflow_id = "${workflowId}"`,
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

		// Compute formulas live in tools_automation, not on the field def.
		// For UI editing, surface the formula + deps back onto each computed
		// def so the field-config panel can render its textbox as if compute
		// were a def-level property. The persisted shape stays clean.
		const computeAutomationByTargetId = new Map<string, any>();
		for (const a of automations) {
			if (a.trigger_type !== 'on_field_change') continue;
			let steps: any;
			try {
				steps = typeof a.steps === 'string' ? JSON.parse(a.steps) : a.steps;
			} catch {
				continue;
			}
			const action = steps?.[0]?.actions?.[0];
			if (action?.type !== 'set_field_value') continue;
			const targetId = action?.params?.field_key;
			if (typeof targetId === 'string') computeAutomationByTargetId.set(targetId, a);
		}
		for (const def of fieldDefs) {
			if (def.write_mode !== 'computed') continue;
			const auto = computeAutomationByTargetId.get(def.id);
			if (!auto) {
				def.compute_expression = '';
				def.compute_depends_on = [];
				def.compute_automation_id = null;
				continue;
			}
			let steps: any;
			try {
				steps = typeof auto.steps === 'string' ? JSON.parse(auto.steps) : auto.steps;
			} catch {
				steps = null;
			}
			let trigger: any;
			try {
				trigger =
					typeof auto.trigger_config === 'string'
						? JSON.parse(auto.trigger_config)
						: auto.trigger_config;
			} catch {
				trigger = null;
			}
			def.compute_expression = steps?.[0]?.actions?.[0]?.params?.value ?? '';
			def.compute_depends_on = Array.isArray(trigger?.field_keys)
				? trigger.field_keys
				: trigger?.field_key
					? [trigger.field_key]
					: [];
			def.compute_automation_id = auto.id;
		}

		// Refs stay raw ({ id, form_id, field_def_id, config }) — the builder
		// resolves ref ⊕ def into its read-model client-side.
		const fieldRefs = workflowFormFieldRefs.map((ref: any) => ({
			id: ref.id,
			form_id: ref.form_id,
			field_def_id: ref.field_def_id,
			config: ref.config ?? {}
		}));

		// Filter edit tools to only those belonging to this workflow's connections or stages
		const connectionIds = connections.map((c: any) => c.id);
		const stageIds = stages.map((s: any) => s.id);
		const workflowEditTools = editTools.filter(
			(e: any) =>
				connectionIds.includes(e.connection_id) ||
				(Array.isArray(e.stage_id) && e.stage_id.some((sid: string) => stageIds.includes(sid)))
		);

		return {
			workflow,
			stages,
			connections,
			forms,
			fieldRefs,
			fieldDefs,
			editTools: workflowEditTools,
			protocolTools,
			automations,
			fieldTags,
			roles,
			projectWorkflows
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
			return fail(400, {
				message: workflowBuilderServerRoleNameRequired?.() ?? 'Role name is required'
			});
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
			return fail(500, {
				message: workflowBuilderServerFailedToCreateRole?.() ?? 'Failed to create role'
			});
		}
	},

	saveWorkflow: async ({ request, locals: { pbAdmin: pb } }) => {
		const formData = await request.formData();
		const changesJson = formData.get('changes') as string;

		if (!changesJson) {
			return fail(400, {
				message: workflowBuilderServerNoChangesProvided?.() ?? 'No changes provided'
			});
		}

		let changes: {
			stages: { new: any[]; modified: any[]; deleted: string[] };
			connections: { new: any[]; modified: any[]; deleted: string[] };
			forms: { new: any[]; modified: any[]; deleted: string[] };
			/** Raw tools_form_field_refs rows: { id, form_id, field_def_id, config }. */
			fieldRefs: { new: any[]; modified: any[]; deleted: string[] };
			editTools: { new: any[]; modified: any[]; deleted: string[] };
			protocolTools?: { new: any[]; modified: any[]; deleted: string[] };
			automations: { new: any[]; modified: any[]; deleted: string[] };
			fieldTags?: { new: any[]; modified: any[]; deleted: string[] };
			fieldDefs?: { new: any[]; modified: any[]; deleted: string[] };
			workflow?: {
				id: string;
				visible_to_roles: string[];
				private_instances: boolean;
				dirty: boolean;
			};
		};

		try {
			changes = JSON.parse(changesJson);
		} catch {
			return fail(400, {
				message: workflowBuilderServerInvalidChangesFormat?.() ?? 'Invalid changes format'
			});
		}

		try {
			const batch = pb.createBatch();
			// Count requests actually queued so we can skip batch.send() when empty
			// (PocketBase rejects empty batches with 400 "Invalid batch request data.").
			// Some change-groups (e.g. fieldDefs.new/modified) are written outside the
			// batch, so a save can leave the batch empty even when `changes` is not.
			let batchOps = 0;
			const _origCollection = batch.collection.bind(batch);
			batch.collection = (name: string) => {
				const sub = _origCollection(name);
				for (const method of ['create', 'update', 'delete', 'upsert'] as const) {
					const orig = (sub as any)[method]?.bind(sub);
					if (orig) {
						(sub as any)[method] = (...args: any[]) => {
							batchOps++;
							return orig(...args);
						};
					}
				}
				return sub;
			};

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

			// Compute helpers for section 3b (field-def writes). The
			// {field_def_id} regex matches the expression parser in
			// pb_hooks/automation.js.
			const PB_ID_RE_COMPUTE = /^[a-zA-Z0-9]{15}$/;
			const extractDeps = (expr: string): string[] => {
				if (!expr || typeof expr !== 'string') return [];
				const out: string[] = [];
				const seen = new Set<string>();
				const re = /\{([^}]+)\}/g;
				let m: RegExpExecArray | null;
				while ((m = re.exec(expr)) !== null) {
					const candidate = m[1].trim();
					if (PB_ID_RE_COMPUTE.test(candidate) && !seen.has(candidate)) {
						seen.add(candidate);
						out.push(candidate);
					}
				}
				return out;
			};
			const upsertComputeAutomation = async (
				def: { id: string; label?: string },
				workflowId: string,
				expression: string
			) => {
				const deps = extractDeps(expression);
				const existing = await pb.collection('tools_automation').getFullList({
					filter: `workflow_id = "${workflowId}" && trigger_type = "on_field_change"`,
					requestKey: null
				});
				const match = existing.find((a: any) => {
					try {
						const steps = typeof a.steps === 'string' ? JSON.parse(a.steps) : a.steps;
						return steps?.[0]?.actions?.[0]?.params?.field_key === def.id;
					} catch {
						return false;
					}
				});
				const payload = {
					workflow_id: workflowId,
					name: `Compute: ${def.label ?? 'field'}`,
					trigger_type: 'on_field_change',
					trigger_config: { field_keys: deps },
					steps: [
						{
							name: 'Compute',
							actions: [
								{
									type: 'set_field_value',
									params: { field_key: def.id, value: expression }
								}
							]
						}
					],
					execution_mode: 'run_all',
					is_enabled: true
				};
				if (match) {
					await pb.collection('tools_automation').update(match.id, payload, { requestKey: null });
				} else {
					await pb.collection('tools_automation').create(payload, { requestKey: null });
				}
			};
			const deleteComputeAutomation = async (defId: string, workflowId: string) => {
				const existing = await pb.collection('tools_automation').getFullList({
					filter: `workflow_id = "${workflowId}" && trigger_type = "on_field_change"`,
					requestKey: null
				});
				const match = existing.find((a: any) => {
					try {
						const steps = typeof a.steps === 'string' ? JSON.parse(a.steps) : a.steps;
						return steps?.[0]?.actions?.[0]?.params?.field_key === defId;
					} catch {
						return false;
					}
				});
				if (match) {
					await pb.collection('tools_automation').delete(match.id, { requestKey: null });
				}
			};

			// 3b. Field Defs (workflow_field_defs).
			// ORDERING INVARIANT: def creates are queued in the batch BEFORE the
			// ref creates in section 4, so a ref can FK a def minted client-side
			// in this same atomic batch. Compute formulas piggyback on the def
			// payload (compute_expression / compute_depends_on are UI
			// conveniences, not columns); strip before sending to PB and
			// re-route into a companion tools_automation row.
			const stripComputeAuxFields = (def: any) => {
				const {
					compute_expression: expr,
					compute_depends_on,
					compute_automation_id,
					...rest
				} = def;
				return { rest, expr: typeof expr === 'string' ? expr.trim() : '' };
			};
			if (changes.fieldDefs) {
				for (const def of changes.fieldDefs.new) {
					const { rest, expr } = stripComputeAuxFields(def);
					// Honor the client-minted id (refs in this save FK to it); fall
					// back to a server id for callers that omit one.
					const newId = (rest as any).id && /^[a-zA-Z0-9]{15}$/.test((rest as any).id)
						? (rest as any).id
						: generateId();
					batch.collection('workflow_field_defs').create({ ...rest, id: newId });
					if (rest.write_mode === 'computed' && expr) {
						await upsertComputeAutomation(
							{ id: newId, label: rest.label },
							rest.workflow_id,
							expr
						);
					}
				}
				for (const def of changes.fieldDefs.modified) {
					const { rest, expr } = stripComputeAuxFields(def);
					batch.collection('workflow_field_defs').update(def.id, rest);
					if (rest.write_mode === 'computed' && expr) {
						await upsertComputeAutomation(
							{ id: def.id, label: rest.label },
							rest.workflow_id,
							expr
						);
					} else {
						await deleteComputeAutomation(def.id, rest.workflow_id);
					}
				}
				for (const defId of changes.fieldDefs.deleted) {
					// Companion automation has no DB FK to the def; remove it
					// explicitly before the def deletion lands.
					try {
						const existing = await pb.collection('workflow_field_defs').getOne(defId, {
							fields: 'workflow_id',
							requestKey: null
						});
						await deleteComputeAutomation(defId, (existing as any).workflow_id);
					} catch {
						/* def already gone */
					}
					batch.collection('workflow_field_defs').delete(defId);
				}
			}

			// Pre-fetch existing form_field_ref ids so we can guard modified/deleted
			// against stale client state (a client-tracked "modified" ref whose row
			// was already deleted server-side tanks the whole transactional batch).
			const existingRefIds = new Set<string>();
			const refIdToFormId = new Map<string, string>();
			{
				const candidateIds = [
					...changes.fieldRefs.modified.map((f: any) => f.id),
					...changes.fieldRefs.deleted
				].filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9]{15}$/.test(id));
				if (candidateIds.length > 0) {
					const filter = Array.from(new Set(candidateIds))
						.map((id) => `id = "${id}"`)
						.join(' || ');
					const rows = await pb.collection('tools_form_field_refs').getFullList({
						filter,
						fields: 'id,form_id',
						requestKey: null
					});
					for (const r of rows) {
						existingRefIds.add((r as any).id);
						refIdToFormId.set((r as any).id, (r as any).form_id);
					}
				}
			}
			const deletedFormIds = new Set<string>(changes.forms.deleted);

			// 4. Form Field Refs — pure ref CRUD. Defs travel exclusively through
			// changes.fieldDefs (section 3b, queued in the batch BEFORE these ref
			// creates, so a ref can FK a def minted in this same save).
			const PB_ID_RE = /^[a-zA-Z0-9]{15}$/;

			const buildRefPayload = (ref: any) => ({
				form_id: ref.form_id,
				field_def_id: ref.field_def_id,
				config: ref.config ?? {}
			});

			for (const ref of changes.fieldRefs.new) {
				if (typeof ref.field_def_id !== 'string' || !PB_ID_RE.test(ref.field_def_id)) {
					throw new Error(`Form field ref ${ref.id} carries an invalid field_def_id.`);
				}
				const payload: Record<string, unknown> = buildRefPayload(ref);
				// Honor the client-minted ref id so client state stays addressable
				// after the save (no refresh needed to re-identify rows).
				if (typeof ref.id === 'string' && PB_ID_RE.test(ref.id)) payload.id = ref.id;
				batch.collection('tools_form_field_refs').create(payload);
			}

			for (const ref of changes.fieldRefs.modified) {
				if (existingRefIds.has(ref.id)) {
					batch.collection('tools_form_field_refs').update(ref.id, buildRefPayload(ref));
				} else {
					// Client thinks this ref exists, but it doesn't (deleted out-of-band
					// or left stale by a prior failed save). Recreate so the field is
					// still persisted instead of failing the entire batch.
					const payload: Record<string, unknown> = buildRefPayload(ref);
					if (typeof ref.id === 'string' && PB_ID_RE.test(ref.id)) payload.id = ref.id;
					batch.collection('tools_form_field_refs').create(payload);
				}
			}

			for (const refId of changes.fieldRefs.deleted) {
				if (!existingRefIds.has(refId)) continue; // already gone
				const formId = refIdToFormId.get(refId);
				if (formId && deletedFormIds.has(formId)) continue; // server cascade will remove it
				batch.collection('tools_form_field_refs').delete(refId);
			}

			// 5. Edit Tools removed in Phase 1 redesign.

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

			// 8. Edit Tools — `editable_fields` reference real def ids (minted
			// client-side); defs created in this save are queued earlier in the
			// same batch, so the relations resolve atomically.
			if (changes.editTools) {
				for (const tool of changes.editTools.new) {
					batch.collection('tools_edit').create(tool);
				}
				for (const tool of changes.editTools.modified) {
					batch.collection('tools_edit').update(tool.id, tool);
				}
				for (const toolId of changes.editTools.deleted) {
					batch.collection('tools_edit').delete(toolId);
				}
			}

			// Execute batch only if any operations were queued.
			if (batchOps > 0) await batch.send();

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

				console.log('[saveWorkflow] Syncing entry_allowed_roles:', workflowId, entryAllowedRoles);

				await pb.collection('workflows').update(workflowId, {
					entry_allowed_roles: entryAllowedRoles
				});
			}

			// Persist workflow-level permission fields edited in the permissions
			// matrix. Separate from the entry_allowed_roles sync above — disjoint
			// fields on the same record, so sequential updates are safe.
			if (changes.workflow?.dirty && changes.workflow.id) {
				await pb.collection('workflows').update(changes.workflow.id, {
					visible_to_roles: changes.workflow.visible_to_roles ?? [],
					private_instances: changes.workflow.private_instances ?? false
				});
			}

			return { success: true };
		} catch (err) {
			// PocketBase batch failures are atomic: the top-level message is the
			// generic "Batch transaction failed." — the per-request errors that
			// identify the culprit live in the nested response. Dump them fully
			// (console.error truncates nested objects to "[Object]").
			const anyErr = err as any;
			const detail =
				anyErr?.response?.data ?? anyErr?.originalError?.data ?? anyErr?.response ?? err;
			console.error('Failed to save workflow:', anyErr?.message ?? err);
			console.error('Batch failure detail:', JSON.stringify(detail, null, 2));
			return fail(500, {
				message: workflowBuilderServerFailedToSaveWorkflow?.() ?? 'Failed to save workflow'
			});
		}
	}
};
