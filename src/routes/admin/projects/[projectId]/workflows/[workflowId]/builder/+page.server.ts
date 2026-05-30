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
		// TODO(field-def-redesign): fetch workflow_field_defs and pass through as
		// `fieldDefs`. The page currently denormalizes ref+def into the legacy
		// `formFields` shape; convert to a proper (refs, defs) pair in a follow-up.
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

		// Denormalize def -> ref into the flat shape the builder UI works with:
		// presentation from the ref's `config` JSON, definitional bits from the
		// matching field def. The save layer re-packs presentation into `config`.
		const defById = new Map<string, any>();
		for (const d of fieldDefs) defById.set(d.id, d);
		const workflowFormFields = workflowFormFieldRefs.map((ref: any) => {
			const def = defById.get(ref.field_def_id) ?? {};
			const config = ref.config ?? {};
			return {
				id: ref.id,
				form_id: ref.form_id,
				field_def_id: ref.field_def_id,
				field_order: config.field_order ?? 0,
				page: config.page ?? 1,
				row_index: config.row_index ?? 0,
				column_position: config.column_position ?? 'full',
				is_required: config.is_required ?? false,
				placeholder: config.placeholder ?? '',
				help_text: config.help_text ?? '',
				conditional_logic: config.conditional_logic ?? null,
				field_label: def.label ?? '',
				field_type: def.field_type ?? 'short_text',
				field_options: def.field_options ?? null,
				validation_rules: def.validation_rules ?? null,
				write_mode: def.write_mode ?? 'singleton',
				compute_expression: def.compute_expression ?? ''
			};
		});

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
			formFields: workflowFormFields,
			// TODO(field-def-redesign): expose raw refs + defs once UI is migrated.
			formFieldRefs: workflowFormFieldRefs,
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
			formFields: { new: any[]; modified: any[]; deleted: string[] };
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

			// Compute helpers — used by section 3b (direct def edits) and
			// section 4 (denormalized form-field saves). Hoisted here so both
			// paths can call them. The {field_def_id} regex matches the
			// expression parser in pb_hooks/automation.js.
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

			// 3b. Field Defs (workflow_field_defs) — created BEFORE form-field refs
			// so refs can FK to real def ids. Sync writes outside the batch.
			// Compute formulas piggyback on the def payload (compute_expression /
			// compute_depends_on are UI conveniences, not columns); strip before
			// sending to PB and re-route into a companion tools_automation row.
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
					// Pre-mint id so any later formField ref in this same save can
					// FK to it; queue inside batch so it rolls back atomically.
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
					...changes.formFields.modified.map((f: any) => f.id),
					...changes.formFields.deleted
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

			// 4. Form Fields
			// Each incoming "field" is the denormalized shape (ref + def). Split it
			// into: a `workflow_field_defs` upsert (label/type/options/validation/
			// write_mode/etc.) and a `tools_form_field_refs` upsert (layout +
			// per-form overrides). Definitional rows are written first (synchronously,
			// outside the batch) so the ref rows can FK to a real def id.
			const formFieldsAll = [...changes.formFields.new, ...changes.formFields.modified];

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

			// Per-workflow cache of existing defs keyed by label. We use this both
			// for collision-driven label suffixing AND for reuse-by-identity when a
			// client `_temp_*` placeholder matches an already-persisted def. Reuse
			// closes a partial-failure loop: a previous save that committed a def
			// outside the batch but failed the batch left an orphan; the next
			// retry now picks that orphan back up instead of bumping to "(n)".
			type CachedDef = {
				id: string;
				label: string;
				field_type: string;
				write_mode: string;
				field_options: unknown;
				validation_rules: unknown;
			};
			const existingDefsByWorkflow = new Map<string, Map<string, CachedDef>>();
			const ensureDefCache = async (workflowId: string): Promise<Map<string, CachedDef>> => {
				let cache = existingDefsByWorkflow.get(workflowId);
				if (cache) return cache;
				const defs = await pb.collection('workflow_field_defs').getFullList({
					filter: `workflow_id = "${workflowId}"`,
					fields: 'id,label,field_type,write_mode,field_options,validation_rules',
					requestKey: null
				});
				cache = new Map<string, CachedDef>();
				for (const d of defs as any[]) cache.set(d.label, d as CachedDef);
				existingDefsByWorkflow.set(workflowId, cache);
				return cache;
			};
			const uniqueLabel = async (workflowId: string, base: string): Promise<string> => {
				const cache = await ensureDefCache(workflowId);
				const root = (base || 'New Field').slice(0, 250);
				let candidate = root;
				let n = 2;
				while (cache.has(candidate)) {
					candidate = `${root} (${n++})`;
				}
				return candidate;
			};

			// Treat an incoming `_temp_*` def as a candidate for reuse only when it
			// is uncustomized — same field_type / write_mode AND no non-default
			// options or validation. Smart dropdowns, computed fields, choice lists
			// with options, etc. always fall through to the create path so they
			// never silently merge with an unrelated def.
			const isEmptyObj = (v: unknown): boolean =>
				v == null || (typeof v === 'object' && Object.keys(v as object).length === 0);
			const tryReuseExistingDef = async (
				field: any,
				workflowId: string
			): Promise<string | null> => {
				const label = (field.field_label ?? '').slice(0, 250);
				if (!label) return null;
				if (!isEmptyObj(field.field_options) || !isEmptyObj(field.validation_rules)) return null;
				if ((field.write_mode ?? 'singleton') === 'computed') return null;
				const cache = await ensureDefCache(workflowId);
				const hit = cache.get(label);
				if (!hit) return null;
				if (hit.field_type !== (field.field_type ?? 'short_text')) return null;
				if (hit.write_mode !== (field.write_mode ?? 'singleton')) return null;
				if (!isEmptyObj(hit.field_options) || !isEmptyObj(hit.validation_rules)) return null;
				return hit.id;
			};

			const buildDefPayload = (field: any, workflowId: string, label: string) => ({
				workflow_id: workflowId,
				label,
				field_type: field.field_type ?? 'short_text',
				write_mode: field.write_mode ?? 'singleton',
				field_options: field.field_options ?? null,
				validation_rules: field.validation_rules ?? null
			});

			const buildRefPayload = (field: any, fieldDefId: string) => ({
				form_id: field.form_id,
				field_def_id: fieldDefId,
				config: {
					field_order: field.field_order ?? 0,
					page: field.page ?? 1,
					row_index: field.row_index ?? 0,
					column_position: field.column_position ?? 'full',
					is_required: field.is_required ?? false,
					placeholder: field.placeholder ?? '',
					help_text: field.help_text ?? '',
					conditional_logic: field.conditional_logic ?? null
				}
			});

			// Upsert field defs first (outside batch) so we have real ids for refs.
			// Map of incoming temp/placeholder field_def_id -> real id.
			const defIdResolution = new Map<string, string>();

			// Sync the computed-field companion automation after its def upsert.
			const syncCompanionAutomation = async (field: any, workflowId: string, defId: string) => {
				const writeMode = field.write_mode ?? 'singleton';
				const expression = (field.compute_expression ?? '').trim();
				if (writeMode === 'computed' && expression) {
					await upsertComputeAutomation(
						{ id: defId, label: field.field_label },
						workflowId,
						expression
					);
				} else {
					await deleteComputeAutomation(defId, workflowId);
				}
			};

			// Resolve a `_temp_*` placeholder to a real def id. Tries reuse first;
			// otherwise pre-generates an id and queues the def create inside the
			// batch so def + ref are committed atomically.
			const resolvePlaceholderDef = async (
				field: any,
				workflowId: string,
				incomingDefId: string | undefined
			): Promise<string> => {
				const reused = await tryReuseExistingDef(field, workflowId);
				if (reused) {
					if (incomingDefId) defIdResolution.set(incomingDefId, reused);
					field.field_def_id = reused;
					return reused;
				}
				const label = await uniqueLabel(workflowId, field.field_label);
				const newId = generateId();
				batch
					.collection('workflow_field_defs')
					.create({ id: newId, ...buildDefPayload(field, workflowId, label) });
				// Make the just-minted def visible to subsequent reuse attempts in
				// this same save (e.g. user added two "Test" fields at once).
				const cache = await ensureDefCache(workflowId);
				cache.set(label, {
					id: newId,
					label,
					field_type: field.field_type ?? 'short_text',
					write_mode: field.write_mode ?? 'singleton',
					field_options: field.field_options ?? null,
					validation_rules: field.validation_rules ?? null
				});
				if (incomingDefId) defIdResolution.set(incomingDefId, newId);
				field.field_def_id = newId;
				return newId;
			};

			// NEW fields: create a def, capture id.
			for (const field of changes.formFields.new) {
				const workflowId = formIdToWorkflowId.get(field.form_id);
				if (!workflowId) {
					throw new Error(`Cannot resolve workflow_id for form ${field.form_id}`);
				}
				const incomingDefId: string | undefined = field.field_def_id;
				const isPlaceholder =
					!incomingDefId || incomingDefId.startsWith('_temp_') || !PB_ID_RE.test(incomingDefId);

				if (isPlaceholder) {
					await resolvePlaceholderDef(field, workflowId, incomingDefId);
				} else {
					// Existing def id supplied on a "new" ref: update def inside the
					// batch so it rolls back with the rest of the transaction on
					// failure.
					const cache = await ensureDefCache(workflowId);
					const existsInCache = Array.from(cache.values()).some((d) => d.id === incomingDefId);
					if (existsInCache) {
						batch
							.collection('workflow_field_defs')
							.update(
								incomingDefId!,
								buildDefPayload(field, workflowId, field.field_label)
							);
					} else {
						// Def vanished server-side -> mint a fresh one (reuse-aware).
						await resolvePlaceholderDef(field, workflowId, incomingDefId);
					}
				}
				await syncCompanionAutomation(field, workflowId, field.field_def_id);
				batch
					.collection('tools_form_field_refs')
					.create(buildRefPayload(field, field.field_def_id));
			}

			// MODIFIED fields: update both def + ref.
			for (const field of changes.formFields.modified) {
				const workflowId = formIdToWorkflowId.get(field.form_id);
				if (!workflowId) {
					throw new Error(`Cannot resolve workflow_id for form ${field.form_id}`);
				}
				let defId: string | undefined = field.field_def_id;
				const placeholder = !defId || defId.startsWith('_temp_') || !PB_ID_RE.test(defId);

				if (placeholder) {
					defId = await resolvePlaceholderDef(field, workflowId, defId);
				} else {
					const cache = await ensureDefCache(workflowId);
					const existsInCache = Array.from(cache.values()).some((d) => d.id === defId);
					if (existsInCache) {
						batch
							.collection('workflow_field_defs')
							.update(defId!, buildDefPayload(field, workflowId, field.field_label));
					} else {
						// Def vanished server-side -> mint a fresh one (reuse-aware).
						defId = await resolvePlaceholderDef(field, workflowId, defId);
					}
				}
				await syncCompanionAutomation(field, workflowId, defId!);
				if (existingRefIds.has(field.id)) {
					batch.collection('tools_form_field_refs').update(field.id, buildRefPayload(field, defId!));
				} else {
					// Client thinks this ref exists, but it doesn't (deleted out-of-band
					// or left stale by a prior failed save). Recreate so the field is
					// still persisted instead of failing the entire batch.
					batch.collection('tools_form_field_refs').create(buildRefPayload(field, defId!));
				}
			}

			for (const fieldId of changes.formFields.deleted) {
				if (!existingRefIds.has(fieldId)) continue; // already gone
				const formId = refIdToFormId.get(fieldId);
				if (formId && deletedFormIds.has(formId)) continue; // server cascade will remove it
				batch.collection('tools_form_field_refs').delete(fieldId);
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

			// 8. Edit Tools
			// `editable_fields` may reference `_temp_*` placeholder field defs
			// created in the same save (a field dragged into a form). Those defs
			// are materialised above; remap to their real ids — otherwise the
			// relation dangles and the whole batch transaction fails.
			if (changes.editTools) {
				const remapEditableFields = (tool: any) => ({
					...tool,
					editable_fields: Array.isArray(tool.editable_fields)
						? tool.editable_fields.map((id: string) => defIdResolution.get(id) ?? id)
						: tool.editable_fields
				});
				for (const tool of changes.editTools.new) {
					batch.collection('tools_edit').create(remapEditableFields(tool));
				}
				for (const tool of changes.editTools.modified) {
					batch.collection('tools_edit').update(tool.id, remapEditableFields(tool));
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
