import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	workflowDetailServerFailedToImportCsv,
	workflowDetailServerFailedToLoad,
	workflowDetailServerFailedToUpdateFieldValue,
	workflowDetailServerFailedToUpdateFilterValueIcons,
	workflowDetailServerFailedToUpdateIconConfig,
	workflowDetailServerFailedToUpdateStageIconConfig,
	workflowDetailServerFailedToUpdateWorkflow,
	workflowDetailServerFieldNameRequired,
	workflowDetailServerInstanceAndFieldRequired,
	workflowDetailServerInvalidField,
	workflowDetailServerInvalidFilterValueIconsJson,
	workflowDetailServerInvalidIconConfigJson,
	workflowDetailServerNoDataProvided,
	workflowDetailServerNoDataRows,
	workflowDetailServerNoStartStage,
	workflowDetailServerStageIdRequired,
	workflowDetailServerWorkflowNotFound,
	workflowsDeleteError,
	workflowsServer_duplicate_error,
	workflowsServer_import_error,
	workflowsServer_sourceWorkflowId_required
} from '$lib/paraglide/messages';
import {
	ADMIN_INSTANCE_PAGE_SIZE,
	buildRowsFromInstances,
	buildStageNameMap,
	fetchFieldValuesForWorkflow,
	fetchParticipantNameMapForProject
} from '$lib/admin/workflow-rows';
import { duplicateWorkflow } from '$lib/server/schema-transfer';

export const load: PageServerLoad = async ({ params, locals: { pbAdmin: pb } }) => {
	const { projectId, workflowId } = params;

	try {
		const workflow = await pb.collection('workflows').getOne(workflowId, {
			filter: `project_id = "${projectId}"`
		});

		if (!workflow) {
			throw error(404, workflowDetailServerWorkflowNotFound?.() ?? 'Workflow not found');
		}

		// Phase 1: everything that doesn't depend on instance IDs runs in parallel.
		// Field defs come from the workflow-scoped registry; refs only carry
		// per-form layout. We fetch both so admin tables can keep showing one
		// column per field definition.
		const [stages, forms, formFieldRefs, workflowFieldDefs, instancesResult, roles] = await Promise.all([
			pb.collection('workflow_stages').getFullList({
				filter: `workflow_id = "${workflowId}"`,
				fields: 'id,stage_name,stage_type',
				sort: 'stage_order'
			}),
			pb.collection('tools_forms').getFullList({
				filter: `workflow_id = "${workflowId}"`,
				fields: 'id,stage_id,connection_id',
				expand: 'connection_id'
			}),
			pb.collection('tools_form_field_refs').getFullList({
				filter: `form_id.workflow_id = "${workflowId}"`,
				fields: 'id,field_def_id,form_id,field_order',
				sort: 'field_order'
			}),
			pb.collection('workflow_field_defs').getFullList({
				filter: `workflow_id = "${workflowId}"`,
				fields: 'id,label,field_type,field_options'
			}),
			pb.collection('workflow_instances').getList(1, ADMIN_INSTANCE_PAGE_SIZE, {
				filter: `workflow_id = "${workflowId}"`,
				sort: '-created'
			}),
			pb.collection('roles').getFullList({
				filter: `project_id = "${projectId}"`,
				fields: 'id,name',
				sort: 'name'
			})
		]);

		const instances = instancesResult.items;
		const totalInstances = instancesResult.totalItems;

		// Build fieldStageMap: field_def_id -> stage_id (first form-stage that
		// references the def). TODO(field-def-redesign): consider sourcing from
		// `display_stage_id` on the field def directly.
		const formStageMap = new Map<string, string>();
		for (const form of forms) {
			if (form.stage_id) {
				formStageMap.set(form.id, form.stage_id);
			} else if (form.connection_id && form.expand?.connection_id?.to_stage_id) {
				formStageMap.set(form.id, form.expand.connection_id.to_stage_id);
			}
		}
		const fieldStageMap: Record<string, string> = {};
		for (const ref of formFieldRefs) {
			const stageId = formStageMap.get(ref.form_id);
			if (stageId && ref.field_def_id) {
				fieldStageMap[ref.field_def_id] = stageId;
			}
		}

		// Build unique field definitions for columns from the workflow-scoped
		// field-def registry.
		const fieldDefsMap = new Map<
			string,
			{ id: string; label: string; type: string; fieldOptions: any; resolvedEntities?: any[] }
		>();
		for (const def of workflowFieldDefs) {
			let fieldOptions = (def as any).field_options;
			if (typeof fieldOptions === 'string') {
				try {
					fieldOptions = JSON.parse(fieldOptions);
				} catch {
					fieldOptions = null;
				}
			}
			fieldDefsMap.set(def.id, {
				id: def.id,
				label: (def as any).label ?? '',
				type: (def as any).field_type ?? 'short_text',
				fieldOptions
			});
		}
		const fieldDefs = Array.from(fieldDefsMap.values());

		// Resolve entities for custom_table_selector fields in parallel with per-source dedup.
		// Multiple fields referencing the same source (e.g. same custom_table or "participants")
		// share a single underlying fetch. This runs in parallel with Phase 2 (field values
		// + creator names) since neither depends on the other.
		const rawFetchCache = new Map<string, Promise<any[]>>();
		const cachedFetch = (key: string, fetcher: () => Promise<any[]>): Promise<any[]> => {
			let p = rawFetchCache.get(key);
			if (!p) {
				p = fetcher();
				rawFetchCache.set(key, p);
			}
			return p;
		};

		const entityResolutionPromise = Promise.all(
			fieldDefs
				.filter((fd) => fd.type === 'custom_table_selector' && fd.fieldOptions)
				.map(async (fd) => {
					const opts = fd.fieldOptions;
					try {
						if (opts.source_type === 'custom_table' && opts.custom_table_id) {
							const tableData = await cachedFetch(`custom_table:${opts.custom_table_id}`, () =>
								pb.collection('custom_table_data').getFullList({
									filter: `table_id = "${opts.custom_table_id}"`,
									requestKey: null
								})
							);
							fd.resolvedEntities = tableData.map((row: any) => ({
								id:
									opts.value_field === 'id'
										? row.id
										: (row.row_data?.[opts.value_field] ?? row.id),
								label: row.row_data?.[opts.display_field] ?? row.id
							}));
						} else if (opts.source_type === 'participants') {
							const participants = await cachedFetch(`participants:${projectId}`, () =>
								pb.collection('participants').getFullList({
									filter: `project_id = "${projectId}"`,
									fields: 'id,name,email',
									requestKey: null
								})
							);
							fd.resolvedEntities = participants.map((p: any) => ({
								id: p.id,
								label: p.name || p.email || p.id
							}));
						} else if (opts.source_type === 'roles') {
							fd.resolvedEntities = roles.map((r: any) => ({
								id: r.id,
								label: r.name
							}));
						} else if (opts.source_type === 'marker_category' && opts.marker_category_id) {
							const markers = await cachedFetch(`markers:${opts.marker_category_id}`, () =>
								pb.collection('markers').getFullList({
									filter: `category_id = "${opts.marker_category_id}"`,
									fields: 'id,title',
									requestKey: null
								})
							);
							fd.resolvedEntities = markers.map((mk: any) => ({
								id: mk.id,
								label: mk.title || mk.id
							}));
						}
					} catch (err) {
						console.error(`Failed to resolve entities for field ${fd.id}:`, err);
						fd.resolvedEntities = [];
					}
				})
		);

		// Phase 2: field values + creator names. Run in parallel with entity resolution
		// (neither depends on the other). Stage names come from the already-loaded
		// `stages` array -- no expand needed.
		const stageNameById = buildStageNameMap(stages as any);
		const [, fieldValues, creatorNameById] = await Promise.all([
			entityResolutionPromise,
			fetchFieldValuesForWorkflow(pb, workflowId),
			fetchParticipantNameMapForProject(pb, projectId)
		]);
		const initialRows = buildRowsFromInstances(instances, fieldValues, {
			stageNameById,
			creatorNameById
		});

		// Stream the projects list for the "Import from another project" dialog
		// so the detail page renders immediately without waiting on it.
		const projectsPromise = pb
			.collection('projects')
			.getFullList({ fields: 'id,name', sort: 'name', requestKey: null })
			.then((list) => list.map((p: any) => ({ id: p.id, name: p.name })))
			.catch((err) => {
				console.error('Error fetching projects for import dialog:', err);
				return [] as Array<{ id: string; name: string }>;
			});

		return {
			workflow,
			stages,
			fieldDefs,
			fieldStageMap,
			initialRows,
			totalInstances,
			instancePageSize: ADMIN_INSTANCE_PAGE_SIZE,
			roles: roles || [],
			projects: projectsPromise
		};
	} catch (err: any) {
		if (err?.status) throw err;
		console.error('Error loading workflow data:', err);
		throw error(500, workflowDetailServerFailedToLoad?.() ?? 'Failed to load workflow');
	}
};

export const actions: Actions = {
	updateFieldValue: async ({ request, params, locals: { pbAdmin: pb } }) => {
		const formData = await request.formData();
		const instanceId = formData.get('instance_id') as string;
		const fieldKey = formData.get('field_key') as string;
		const newValue = formData.get('value') as string;
		const stageId = formData.get('stage_id') as string;

		if (!instanceId || !fieldKey) {
			return fail(400, { message: workflowDetailServerInstanceAndFieldRequired?.() ?? 'Instance ID and field key are required' });
		}

		try {
			// workflow_field_values is append-only. Every admin edit creates a new
			// row; "current value" is the latest by recorded_at. The previous row
			// IS the before-value — no need to copy it into tool_usage metadata.
			const toolUsage = await pb.collection('workflow_instance_tool_usage').create({
				instance_id: instanceId,
				stage_id: stageId || null,
				executed_by: null,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'admin_edit',
					// Identifiers only — values live in workflow_field_values
					// (append-only, gated by field-level view_roles).
					changes: [{ field_key: fieldKey }]
				}
			});

			const def = await pb
				.collection('workflow_field_defs')
				.getOne(fieldKey, { fields: 'write_mode', requestKey: null });
			const writeMode = (def as any).write_mode ?? 'singleton';

			await pb.collection('workflow_field_values').create({
				instance_id: instanceId,
				field_def_id: fieldKey,
				recorded_at_stage: stageId || null,
				recorded_by_action: toolUsage.id,
				recorded_at: new Date().toISOString(),
				write_mode: writeMode,
				value: newValue
			});

			return { success: true };
		} catch (err) {
			console.error('Error updating field value:', err);
			return fail(500, { message: workflowDetailServerFailedToUpdateFieldValue?.() ?? 'Failed to update field value' });
		}
	},

	updateIconConfig: async ({ request, params, locals: { pbAdmin: pb } }) => {
		const { workflowId } = params;
		const formData = await request.formData();
		const iconConfigJson = formData.get('iconConfig') as string;

		let iconConfig;
		try {
			iconConfig = iconConfigJson ? JSON.parse(iconConfigJson) : {};
		} catch {
			return fail(400, { message: workflowDetailServerInvalidIconConfigJson?.() ?? 'Invalid icon config JSON' });
		}

		try {
			await pb.collection('workflows').update(workflowId, {
				icon_config: iconConfig
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating workflow icon config:', err);
			return fail(500, { message: workflowDetailServerFailedToUpdateIconConfig?.() ?? 'Failed to update icon config' });
		}
	},

	updateStageIconConfig: async ({ request, params, locals: { pbAdmin: pb } }) => {
		const formData = await request.formData();
		const stageId = formData.get('stageId') as string;
		const iconConfigJson = formData.get('iconConfig') as string;

		if (!stageId) {
			return fail(400, { message: workflowDetailServerStageIdRequired?.() ?? 'Stage ID is required' });
		}

		let iconConfig: Record<string, unknown> | null;
		try {
			iconConfig = iconConfigJson ? JSON.parse(iconConfigJson) : null;
		} catch {
			return fail(400, { message: workflowDetailServerInvalidIconConfigJson?.() ?? 'Invalid icon config JSON' });
		}

		try {
			const stage = await pb.collection('workflow_stages').getOne(stageId);
			const currentVisualConfig = (stage.visual_config as Record<string, unknown>) || {};
			const { icon_config: _removed, ...rest } = currentVisualConfig;
			const updatedVisualConfig = iconConfig
				? { ...rest, icon_config: iconConfig }
				: rest;

			await pb.collection('workflow_stages').update(stageId, {
				visual_config: updatedVisualConfig
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating stage icon config:', err);
			return fail(500, { message: workflowDetailServerFailedToUpdateStageIconConfig?.() ?? 'Failed to update stage icon config' });
		}
	},

	updateFilterValueIcons: async ({ request, params, locals: { pbAdmin: pb } }) => {
		const { workflowId } = params;
		const formData = await request.formData();
		const iconsJson = formData.get('filterValueIcons') as string;

		let filterValueIcons;
		try {
			filterValueIcons = iconsJson ? JSON.parse(iconsJson) : {};
		} catch {
			return fail(400, { message: workflowDetailServerInvalidFilterValueIconsJson?.() ?? 'Invalid filter value icons JSON' });
		}

		try {
			await pb.collection('workflows').update(workflowId, {
				filter_value_icons: filterValueIcons
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating filter value icons:', err);
			return fail(500, { message: workflowDetailServerFailedToUpdateFilterValueIcons?.() ?? 'Failed to update filter value icons' });
		}
	},

	importCSV: async ({ request, params, locals: { pbAdmin: pb } }) => {
		const { workflowId } = params;
		const formData = await request.formData();
		const rowsJson = formData.get('rows') as string;
		const replaceData = formData.get('replaceData') === 'true';
		const targetStageId = formData.get('targetStageId') as string;

		if (!rowsJson) {
			return fail(400, { message: workflowDetailServerNoDataProvided?.() ?? 'No data provided' });
		}

		try {
			const rows: Array<Record<string, string>> = JSON.parse(rowsJson);

			if (rows.length === 0) {
				return fail(400, { message: workflowDetailServerNoDataRows?.() ?? 'No data rows to import' });
			}

			// Fetch stages and resolve target stage
			const stages = await pb.collection('workflow_stages').getFullList({
				filter: `workflow_id = "${workflowId}"`,
				fields: 'id,stage_type'
			});
			const startStage = stages.find((s) => s.stage_type === 'start');
			if (!startStage) {
				return fail(400, { message: workflowDetailServerNoStartStage?.() ?? 'Workflow has no start stage' });
			}
			const instanceStageId = targetStageId || startStage.id;

			// Build fieldStageMap: field_def_id -> stage_id (same logic as load function)
			const forms = await pb.collection('tools_forms').getFullList({
				filter: `workflow_id = "${workflowId}"`,
				fields: 'id,stage_id,connection_id',
				expand: 'connection_id'
			});
			const formStageMap = new Map<string, string>();
			for (const form of forms) {
				if (form.stage_id) {
					formStageMap.set(form.id, form.stage_id);
				} else if (form.connection_id && form.expand?.connection_id?.to_stage_id) {
					formStageMap.set(form.id, form.expand.connection_id.to_stage_id);
				}
			}
			const formIds = forms.map((f: any) => f.id);
			let formFieldRefs: any[] = [];
			if (formIds.length > 0) {
				const filterParts = formIds.map((id: string) => `form_id = "${id}"`);
				formFieldRefs = await pb.collection('tools_form_field_refs').getFullList({
					filter: filterParts.join(' || '),
					fields: 'id,form_id,field_def_id',
					requestKey: null
				});
			}
			const fieldStageMap: Record<string, string> = {};
			for (const ref of formFieldRefs) {
				const stageId = formStageMap.get(ref.form_id);
				if (stageId && ref.field_def_id) {
					fieldStageMap[ref.field_def_id] = stageId;
				}
			}

			// Replace existing instances if requested
			if (replaceData) {
				const existing = await pb.collection('workflow_instances').getFullList({
					filter: `workflow_id = "${workflowId}"`,
					fields: 'id'
				});
				for (const inst of existing) {
					const fieldValues = await pb.collection('workflow_field_values').getFullList({
						filter: `instance_id = "${inst.id}"`,
						fields: 'id'
					});
					for (const fv of fieldValues) {
						await pb.collection('workflow_field_values').delete(fv.id);
					}
					await pb.collection('workflow_instances').delete(inst.id);
				}
			}
			// CSV import keys columns by field_def_id. Look up write_mode from the
			// def per column so observations are created with the right mode.
			const csvFieldDefs = await pb.collection('workflow_field_defs').getFullList({
				filter: `workflow_id = "${workflowId}"`,
				fields: 'id,write_mode',
				requestKey: null
			});
			const writeModeByDefId = new Map<string, string>();
			for (const d of csvFieldDefs) {
				writeModeByDefId.set(d.id, (d as any).write_mode ?? 'singleton');
			}

			// Determine which keys are special (lat, lon) vs form fields.
			// CSV import currently only supports point-type workflows; line/polygon
			// geometries would need a GeoJSON-shaped import column and aren't
			// surfaced here yet.
			const specialKeys = new Set(['lat', 'lon']);
			let importedCount = 0;

			for (const row of rows) {
				// Build geometry from lat/lon if present. The pb_hook derives
				// centroid/bbox server-side so we only ship geometry.
				let geometry: { type: 'Point'; coordinates: [number, number] } | null = null;
				const lat = parseFloat(row['lat']);
				const lon = parseFloat(row['lon']);
				if (!isNaN(lat) && !isNaN(lon)) {
					geometry = { type: 'Point', coordinates: [lon, lat] };
				}

				// Create the workflow instance at the selected stage
				const instance = await pb.collection('workflow_instances').create({
					workflow_id: workflowId,
					current_stage_id: instanceStageId,
					status: 'active',
					geometry
				});

				// Create field values with correct stage_id per field
				for (const [key, value] of Object.entries(row)) {
					if (specialKeys.has(key) || !value) continue;

					await pb.collection('workflow_field_values').create({
						instance_id: instance.id,
						field_def_id: key,
						recorded_at_stage: fieldStageMap[key] || instanceStageId,
						write_mode: writeModeByDefId.get(key) ?? 'singleton',
						value: value
					});
				}

				importedCount++;
			}

			return { success: true, count: importedCount };
		} catch (err) {
			console.error('Error importing CSV:', err);
			return fail(500, {
				message: err instanceof Error ? err.message : (workflowDetailServerFailedToImportCsv?.() ?? 'Failed to import CSV')
			});
		}
	},

	duplicate: async ({ params, locals: { pbAdmin: pb } }) => {
		const { projectId, workflowId } = params;
		try {
			const newId = await duplicateWorkflow(pb, workflowId, projectId);
			return { success: true, duplicatedWorkflowId: newId };
		} catch (err) {
			console.error('Error duplicating workflow:', err);
			return fail(500, { message: workflowsServer_duplicate_error?.() ?? 'Failed to duplicate workflow' });
		}
	},

	importFromProject: async ({ request, params, locals: { pbAdmin: pb } }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const sourceWorkflowId = formData.get('sourceWorkflowId') as string;

		if (!sourceWorkflowId) {
			return fail(400, { message: workflowsServer_sourceWorkflowId_required?.() ?? 'Source workflow ID is required' });
		}

		try {
			const newId = await duplicateWorkflow(pb, sourceWorkflowId, projectId);
			return { success: true, importedWorkflowId: newId };
		} catch (err) {
			console.error('Error importing workflow:', err);
			return fail(500, { message: workflowsServer_import_error?.() ?? 'Failed to import workflow' });
		}
	},

	deleteWorkflow: async ({ params, locals: { pbAdmin: pb } }) => {
		const { projectId, workflowId } = params;
		try {
			const record = await pb.collection('workflows').getOne(workflowId);
			if (record.project_id !== projectId) {
				return fail(403, { message: 'Unauthorized' });
			}
			await pb.collection('workflows').delete(workflowId);
		} catch (err) {
			console.error('Error deleting workflow:', err);
			return fail(500, { message: workflowsDeleteError?.() ?? 'Failed to delete workflow' });
		}
		throw redirect(303, `/admin/projects/${projectId}/settings`);
	},

	updateWorkflowMeta: async ({ request, params, locals: { pbAdmin: pb } }) => {
		const { workflowId } = params;
		const formData = await request.formData();
		const field = formData.get('field') as string;
		const value = formData.get('value') as string;

		if (!field) {
			return fail(400, { message: workflowDetailServerFieldNameRequired?.() ?? 'Field name is required' });
		}

		const allowedFields = ['name', 'description', 'is_active', 'workflow_type', 'geometry_type', 'private_instances', 'visible_to_roles'];
		if (!allowedFields.includes(field)) {
			return fail(400, { message: workflowDetailServerInvalidField?.() ?? 'Invalid field' });
		}

		try {
			let parsedValue: any = value;
			if (field === 'is_active' || field === 'private_instances') {
				parsedValue = value === 'true';
			}
			if (field === 'visible_to_roles') {
				parsedValue = value ? JSON.parse(value) : [];
			}
			if (field === 'geometry_type') {
				// Changing the geometry_type of a workflow that already has instances
				// would leave the existing shapes mismatched against what the
				// participant UI would draw next time. Block the change in that case
				// rather than silently corrupting the collection.
				const existing = await pb.collection('workflow_instances').getList(1, 1, {
					filter: `workflow_id = "${workflowId}"`,
					fields: 'id'
				});
				if (existing.totalItems > 0 && parsedValue !== (await pb.collection('workflows').getOne(workflowId)).geometry_type) {
					return fail(409, { message: 'Cannot change geometry type after instances have been created.' });
				}
				if (!['point', 'line', 'polygon'].includes(parsedValue)) {
					return fail(400, { message: 'Invalid geometry type' });
				}
			}
			await pb.collection('workflows').update(workflowId, {
				[field]: parsedValue
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating workflow metadata:', err);
			return fail(500, { message: workflowDetailServerFailedToUpdateWorkflow?.() ?? 'Failed to update workflow' });
		}
	}
};
