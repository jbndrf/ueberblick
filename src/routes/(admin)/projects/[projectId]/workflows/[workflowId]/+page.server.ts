import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { pb } }) => {
	const { projectId, workflowId } = params;

	try {
		// Fetch workflow
		const workflow = await pb.collection('workflows').getOne(workflowId, {
			filter: `project_id = "${projectId}"`
		});

		if (!workflow) {
			throw error(404, 'Workflow not found');
		}

		// Fetch stages, forms, form fields, instances, and field values in parallel
		const [stages, forms, instances, roles] = await Promise.all([
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
			pb.collection('workflow_instances').getFullList({
				filter: `workflow_id = "${workflowId}"`,
				sort: '-created',
				expand: 'current_stage_id,created_by'
			}),
			pb.collection('roles').getFullList({
				filter: `project_id = "${projectId}"`,
				fields: 'id,name',
				sort: 'name'
			})
		]);

		// Fetch form fields for all forms of this workflow (including field_options for label resolution)
		const formIds = forms.map((f) => f.id);
		let formFields: any[] = [];
		if (formIds.length > 0) {
			const filterParts = formIds.map((id) => `form_id = "${id}"`);
			formFields = await pb.collection('tools_form_fields').getFullList({
				filter: filterParts.join(' || '),
				fields: 'id,field_label,field_type,field_options,form_id',
				sort: 'field_order'
			});
		}

		// Build fieldStageMap: form_field.id -> stage_id
		// Forms can be attached to a stage directly or to a connection (use connection.to_stage_id)
		const formStageMap = new Map<string, string>();
		for (const form of forms) {
			if (form.stage_id) {
				formStageMap.set(form.id, form.stage_id);
			} else if (form.connection_id && form.expand?.connection_id?.to_stage_id) {
				formStageMap.set(form.id, form.expand.connection_id.to_stage_id);
			}
		}
		const fieldStageMap: Record<string, string> = {};
		for (const ff of formFields) {
			const stageId = formStageMap.get(ff.form_id);
			if (stageId) {
				fieldStageMap[ff.id] = stageId;
			}
		}

		// Fetch all field values for all instances
		const instanceIds = instances.map((i) => i.id);
		let fieldValues: any[] = [];
		if (instanceIds.length > 0) {
			// Batch in groups to avoid overly long filters
			const batchSize = 50;
			for (let i = 0; i < instanceIds.length; i += batchSize) {
				const batch = instanceIds.slice(i, i + batchSize);
				const filterParts = batch.map((id) => `instance_id = "${id}"`);
				const batchValues = await pb.collection('workflow_instance_field_values').getFullList({
					filter: filterParts.join(' || '),
					fields: 'id,instance_id,field_key,value,file_value,stage_id',
					requestKey: null
				});
				fieldValues = fieldValues.concat(batchValues);
			}
		}

		// Pivot field values by instance_id, parsing JSON values
		// Store both parsed value and record metadata for updates
		const fieldValuesByInstance: Record<string, Record<string, any>> = {};
		const fieldValueRecords: Record<string, Record<string, { recordId: string; stageId: string }>> = {};
		const filesByInstance: Record<string, Record<string, Array<{ recordId: string; fileName: string }>>> = {};
		for (const fv of fieldValues) {
			if (!fieldValuesByInstance[fv.instance_id]) {
				fieldValuesByInstance[fv.instance_id] = {};
				fieldValueRecords[fv.instance_id] = {};
				filesByInstance[fv.instance_id] = {};
			}

			// File field values: collect into arrays per field_key
			if (fv.file_value) {
				if (!filesByInstance[fv.instance_id][fv.field_key]) {
					filesByInstance[fv.instance_id][fv.field_key] = [];
				}
				filesByInstance[fv.instance_id][fv.field_key].push({
					recordId: fv.id,
					fileName: fv.file_value
				});
				// Still track the record for potential updates
				fieldValueRecords[fv.instance_id][fv.field_key] = {
					recordId: fv.id,
					stageId: fv.stage_id
				};
				continue;
			}

			// Parse JSON arrays/objects stored as strings
			let parsed = fv.value;
			if (typeof parsed === 'string' && (parsed.startsWith('[') || parsed.startsWith('{'))) {
				try {
					parsed = JSON.parse(parsed);
				} catch {
					// keep as string
				}
			}
			fieldValuesByInstance[fv.instance_id][fv.field_key] = parsed;
			fieldValueRecords[fv.instance_id][fv.field_key] = {
				recordId: fv.id,
				stageId: fv.stage_id
			};
		}

		// Build flat row objects
		const rows = instances.map((inst) => ({
			id: inst.id,
			status: inst.status,
			current_stage_id: inst.current_stage_id,
			current_stage_name: inst.expand?.current_stage_id?.stage_name || '',
			created_by_name: inst.expand?.created_by?.name || inst.expand?.created_by?.email || '',
			location: inst.location,
			created: inst.created,
			updated: inst.updated,
			fieldData: fieldValuesByInstance[inst.id] || {},
			fieldValueRecords: fieldValueRecords[inst.id] || {},
			fileData: filesByInstance[inst.id] || {}
		}));

		// Build unique field definitions for columns
		// Deduplicate by field_key (id) since the same field can appear in multiple forms
		const fieldDefsMap = new Map<string, { id: string; label: string; type: string; fieldOptions: any }>();
		for (const ff of formFields) {
			if (!fieldDefsMap.has(ff.id)) {
				// Parse field_options if it's a string
				let fieldOptions = ff.field_options;
				if (typeof fieldOptions === 'string') {
					try { fieldOptions = JSON.parse(fieldOptions); } catch { fieldOptions = null; }
				}
				fieldDefsMap.set(ff.id, {
					id: ff.id,
					label: ff.field_label,
					type: ff.field_type,
					fieldOptions
				});
			}
		}

		// Resolve entities for custom_table_selector fields
		const fieldDefs = Array.from(fieldDefsMap.values());
		for (const fd of fieldDefs) {
			if (fd.type === 'custom_table_selector' && fd.fieldOptions) {
				const opts = fd.fieldOptions;
				try {
					if (opts.source_type === 'custom_table' && opts.custom_table_id) {
						const tableData = await pb.collection('custom_table_data').getFullList({
							filter: `table_id = "${opts.custom_table_id}"`,
							requestKey: null
						});
						fd.resolvedEntities = tableData.map((row: any) => ({
							id: opts.value_field === 'id' ? row.id : (row.row_data?.[opts.value_field] ?? row.id),
							label: row.row_data?.[opts.display_field] ?? row.id
						}));
					} else if (opts.source_type === 'participants') {
						const participants = await pb.collection('participants').getFullList({
							filter: `project_id = "${projectId}"`,
							fields: 'id,name,email',
							requestKey: null
						});
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
						const markers = await pb.collection('markers').getFullList({
							filter: `category_id = "${opts.marker_category_id}"`,
							fields: 'id,title',
							requestKey: null
						});
						fd.resolvedEntities = markers.map((mk: any) => ({
							id: mk.id,
							label: mk.title || mk.id
						}));
					}
				} catch (err) {
					console.error(`Failed to resolve entities for field ${fd.id}:`, err);
					fd.resolvedEntities = [];
				}
			}
		}

		return {
			workflow,
			stages,
			fieldDefs,
			fieldStageMap,
			rows,
			roles: roles || []
		};
	} catch (err: any) {
		if (err?.status) throw err;
		console.error('Error loading workflow data:', err);
		throw error(500, 'Failed to load workflow');
	}
};

export const actions: Actions = {
	updateFieldValue: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const instanceId = formData.get('instance_id') as string;
		const fieldKey = formData.get('field_key') as string;
		const newValue = formData.get('value') as string;
		const oldValue = formData.get('old_value') as string;
		const existingRecordId = formData.get('record_id') as string;
		const stageId = formData.get('stage_id') as string;

		if (!instanceId || !fieldKey) {
			return fail(400, { message: 'Instance ID and field key are required' });
		}

		try {
			// Step 1: Create audit trail entry
			const toolUsage = await pb.collection('workflow_instance_tool_usage').create({
				instance_id: instanceId,
				stage_id: stageId || null,
				executed_by: null,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'admin_edit',
					changes: [{ field_key: fieldKey, before: oldValue || null, after: newValue }]
				}
			});

			// Step 2: Update or create field value
			if (existingRecordId) {
				await pb.collection('workflow_instance_field_values').update(existingRecordId, {
					value: newValue,
					last_modified_by_action: toolUsage.id,
					last_modified_at: new Date().toISOString()
				});
			} else {
				await pb.collection('workflow_instance_field_values').create({
					instance_id: instanceId,
					field_key: fieldKey,
					stage_id: stageId || null,
					value: newValue,
					created_by_action: toolUsage.id
				});
			}

			return { success: true };
		} catch (err) {
			console.error('Error updating field value:', err);
			return fail(500, { message: 'Failed to update field value' });
		}
	},

	updateIconConfig: async ({ request, params, locals: { pb } }) => {
		const { workflowId } = params;
		const formData = await request.formData();
		const iconConfigJson = formData.get('iconConfig') as string;

		let iconConfig;
		try {
			iconConfig = iconConfigJson ? JSON.parse(iconConfigJson) : {};
		} catch {
			return fail(400, { message: 'Invalid icon config JSON' });
		}

		try {
			await pb.collection('workflows').update(workflowId, {
				icon_config: iconConfig
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating workflow icon config:', err);
			return fail(500, { message: 'Failed to update icon config' });
		}
	},

	updateStageIconConfig: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const stageId = formData.get('stageId') as string;
		const iconConfigJson = formData.get('iconConfig') as string;

		if (!stageId) {
			return fail(400, { message: 'Stage ID is required' });
		}

		let iconConfig: Record<string, unknown> | null;
		try {
			iconConfig = iconConfigJson ? JSON.parse(iconConfigJson) : null;
		} catch {
			return fail(400, { message: 'Invalid icon config JSON' });
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
			return fail(500, { message: 'Failed to update stage icon config' });
		}
	},

	updateFilterValueIcons: async ({ request, params, locals: { pb } }) => {
		const { workflowId } = params;
		const formData = await request.formData();
		const iconsJson = formData.get('filterValueIcons') as string;

		let filterValueIcons;
		try {
			filterValueIcons = iconsJson ? JSON.parse(iconsJson) : {};
		} catch {
			return fail(400, { message: 'Invalid filter value icons JSON' });
		}

		try {
			await pb.collection('workflows').update(workflowId, {
				filter_value_icons: filterValueIcons
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating filter value icons:', err);
			return fail(500, { message: 'Failed to update filter value icons' });
		}
	},

	importCSV: async ({ request, params, locals: { pb } }) => {
		const { workflowId } = params;
		const formData = await request.formData();
		const rowsJson = formData.get('rows') as string;
		const replaceData = formData.get('replaceData') === 'true';
		const targetStageId = formData.get('targetStageId') as string;

		if (!rowsJson) {
			return fail(400, { message: 'No data provided' });
		}

		try {
			const rows: Array<Record<string, string>> = JSON.parse(rowsJson);

			if (rows.length === 0) {
				return fail(400, { message: 'No data rows to import' });
			}

			// Fetch stages and resolve target stage
			const stages = await pb.collection('workflow_stages').getFullList({
				filter: `workflow_id = "${workflowId}"`,
				fields: 'id,stage_type'
			});
			const startStage = stages.find((s) => s.stage_type === 'start');
			if (!startStage) {
				return fail(400, { message: 'Workflow has no start stage' });
			}
			const instanceStageId = targetStageId || startStage.id;

			// Build fieldStageMap: field_id -> stage_id (same logic as load function)
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
			let formFields: any[] = [];
			if (formIds.length > 0) {
				const filterParts = formIds.map((id: string) => `form_id = "${id}"`);
				formFields = await pb.collection('tools_form_fields').getFullList({
					filter: filterParts.join(' || '),
					fields: 'id,form_id',
					requestKey: null
				});
			}
			const fieldStageMap: Record<string, string> = {};
			for (const ff of formFields) {
				const stageId = formStageMap.get(ff.form_id);
				if (stageId) {
					fieldStageMap[ff.id] = stageId;
				}
			}

			// Replace existing instances if requested
			if (replaceData) {
				const existing = await pb.collection('workflow_instances').getFullList({
					filter: `workflow_id = "${workflowId}"`,
					fields: 'id'
				});
				for (const inst of existing) {
					const fieldValues = await pb.collection('workflow_instance_field_values').getFullList({
						filter: `instance_id = "${inst.id}"`,
						fields: 'id'
					});
					for (const fv of fieldValues) {
						await pb.collection('workflow_instance_field_values').delete(fv.id);
					}
					await pb.collection('workflow_instances').delete(inst.id);
				}
			}

			// Determine which keys are special (lat, lon) vs form fields
			const specialKeys = new Set(['lat', 'lon']);
			let importedCount = 0;

			for (const row of rows) {
				// Build location from lat/lon if present
				let location = null;
				const lat = parseFloat(row['lat']);
				const lon = parseFloat(row['lon']);
				if (!isNaN(lat) && !isNaN(lon)) {
					location = { lat, lon };
				}

				// Create the workflow instance at the selected stage
				const instance = await pb.collection('workflow_instances').create({
					workflow_id: workflowId,
					current_stage_id: instanceStageId,
					status: 'active',
					location
				});

				// Create field values with correct stage_id per field
				for (const [key, value] of Object.entries(row)) {
					if (specialKeys.has(key) || !value) continue;

					await pb.collection('workflow_instance_field_values').create({
						instance_id: instance.id,
						field_key: key,
						stage_id: fieldStageMap[key] || instanceStageId,
						value: value
					});
				}

				importedCount++;
			}

			return { success: true, count: importedCount };
		} catch (err) {
			console.error('Error importing CSV:', err);
			return fail(500, {
				message: err instanceof Error ? err.message : 'Failed to import CSV'
			});
		}
	},

	updateWorkflowMeta: async ({ request, params, locals: { pb } }) => {
		const { workflowId } = params;
		const formData = await request.formData();
		const field = formData.get('field') as string;
		const value = formData.get('value') as string;

		if (!field) {
			return fail(400, { message: 'Field name is required' });
		}

		const allowedFields = ['name', 'description', 'is_active', 'workflow_type', 'private_instances', 'visible_to_roles'];
		if (!allowedFields.includes(field)) {
			return fail(400, { message: 'Invalid field' });
		}

		try {
			let parsedValue: any = value;
			if (field === 'is_active' || field === 'private_instances') {
				parsedValue = value === 'true';
			}
			if (field === 'visible_to_roles') {
				parsedValue = value ? JSON.parse(value) : [];
			}
			await pb.collection('workflows').update(workflowId, {
				[field]: parsedValue
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating workflow metadata:', err);
			return fail(500, { message: 'Failed to update workflow' });
		}
	}
};
