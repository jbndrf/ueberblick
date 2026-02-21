import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type PocketBase from 'pocketbase';
import { z } from 'zod';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import {
	createUpdateFieldAction,
	createDeleteAction
} from '$lib/server/crud-actions';
import { normalizeRecords } from '$lib/server/pocketbase-helpers';

// ---------------------------------------------------------------------------
// Workflow Duplication Engine (config-driven)
// ---------------------------------------------------------------------------
// To support a new tool type, add one entry to DUPLICATION_LAYERS.
// If the new type has IDs embedded inside JSON fields, add a transformRecord hook.

type IdMaps = Record<string, Map<string, string>>;

type DuplicationLayer = {
	collection: string;
	sort?: string;
	/** Custom loader for collections that aren't filtered by workflow_id directly. */
	loadRecords?: (pb: PocketBase, sourceWorkflowId: string, idMaps: IdMaps) => Promise<any[]>;
	/** Single-relation fields to remap: { fieldName: sourceCollectionKey } */
	remap?: Record<string, string>;
	/** Multi-relation (array) fields to remap: { fieldName: sourceCollectionKey } */
	remapArrays?: Record<string, string>;
	/** Optional hook for remapping IDs embedded inside JSON fields. */
	transformRecord?: (record: any, idMaps: IdMaps) => any;
	/** Fields referencing role IDs -- cleared to [] on cross-project duplication. */
	roleFields?: string[];
};

const SYSTEM_FIELDS = ['collectionId', 'collectionName', 'created', 'updated'];

function generateId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 15 }, () =>
		chars[Math.floor(Math.random() * chars.length)]
	).join('');
}

// -- Transform hooks for JSON-embedded IDs --

function remapFieldOptions(record: any, idMaps: IdMaps): any {
	if (record.field_type !== 'smart_dropdown' || !record.field_options) return record;
	const opts = { ...record.field_options };
	const fieldMap = idMaps['tools_form_fields'];
	const stageMap = idMaps['workflow_stages'];
	if (opts.source_field && fieldMap?.has(opts.source_field)) {
		opts.source_field = fieldMap.get(opts.source_field);
	}
	if (opts.source_stage_id && stageMap?.has(opts.source_stage_id)) {
		opts.source_stage_id = stageMap.get(opts.source_stage_id);
	}
	return { ...record, field_options: opts };
}

function remapAutomationJson(record: any, idMaps: IdMaps): any {
	const stageMap = idMaps['workflow_stages'];
	const fieldMap = idMaps['tools_form_fields'];
	const r = (id: string | null | undefined, map?: Map<string, string>) =>
		id && map?.has(id) ? map.get(id) : id;

	let triggerConfig = record.trigger_config;
	if (triggerConfig) {
		triggerConfig = { ...triggerConfig };
		// on_transition
		if (triggerConfig.from_stage_id) triggerConfig.from_stage_id = r(triggerConfig.from_stage_id, stageMap);
		if (triggerConfig.to_stage_id) triggerConfig.to_stage_id = r(triggerConfig.to_stage_id, stageMap);
		// on_field_change
		if (triggerConfig.stage_id) triggerConfig.stage_id = r(triggerConfig.stage_id, stageMap);
		if (triggerConfig.field_key) triggerConfig.field_key = r(triggerConfig.field_key, fieldMap);
		// scheduled
		if (triggerConfig.target_stage_id) triggerConfig.target_stage_id = r(triggerConfig.target_stage_id, stageMap);
	}

	let conditions = record.conditions;
	if (conditions?.conditions) {
		conditions = {
			...conditions,
			conditions: conditions.conditions.map((c: any) => {
				if (c.type === 'field_value' && c.params) {
					const remapped = { ...c, params: { ...c.params } };
					if (remapped.params.field_key) remapped.params.field_key = r(remapped.params.field_key, fieldMap);
					if (remapped.params.compare_field_key) remapped.params.compare_field_key = r(remapped.params.compare_field_key, fieldMap);
					return remapped;
				}
				return c;
			})
		};
	}

	let actions = record.actions;
	if (Array.isArray(actions)) {
		actions = actions.map((a: any) => {
			if (a.type === 'set_field_value' && a.params) {
				return {
					...a,
					params: {
						...a.params,
						field_key: a.params.field_key ? r(a.params.field_key, fieldMap) : a.params.field_key,
						stage_id: a.params.stage_id ? r(a.params.stage_id, stageMap) : a.params.stage_id
					}
				};
			}
			if (a.type === 'set_stage' && a.params?.stage_id) {
				return { ...a, params: { ...a.params, stage_id: r(a.params.stage_id, stageMap) } };
			}
			return a;
		});
	}

	return { ...record, trigger_config: triggerConfig, conditions, actions };
}

function remapFieldTagMappings(record: any, idMaps: IdMaps): any {
	const fieldMap = idMaps['tools_form_fields'];
	if (!record.tag_mappings || !fieldMap) return record;
	return {
		...record,
		tag_mappings: record.tag_mappings.map((m: any) => ({
			...m,
			fieldId: m.fieldId && fieldMap.has(m.fieldId) ? fieldMap.get(m.fieldId) : m.fieldId
		}))
	};
}

// -- Layer config: add new tool types here --

const DUPLICATION_LAYERS: DuplicationLayer[] = [
	{
		collection: 'workflow_stages',
		sort: 'stage_order',
		remap: { workflow_id: 'workflow' },
		roleFields: ['visible_to_roles'],
	},
	{
		collection: 'workflow_connections',
		remap: {
			workflow_id: 'workflow',
			from_stage_id: 'workflow_stages',
			to_stage_id: 'workflow_stages'
		},
		roleFields: ['allowed_roles'],
	},
	{
		collection: 'tools_forms',
		remap: {
			workflow_id: 'workflow',
			connection_id: 'workflow_connections',
			stage_id: 'workflow_stages'
		},
		roleFields: ['allowed_roles'],
	},
	{
		collection: 'tools_form_fields',
		sort: 'field_order',
		loadRecords: async (pb, _wfId, idMaps) => {
			const formOldIds = new Set(idMaps['tools_forms']?.keys() ?? []);
			if (formOldIds.size === 0) return [];
			const all = await pb.collection('tools_form_fields').getFullList({ sort: 'field_order' });
			return all.filter((f: any) => formOldIds.has(f.form_id));
		},
		remap: { form_id: 'tools_forms' },
		transformRecord: remapFieldOptions,
	},
	{
		collection: 'tools_edit',
		loadRecords: async (pb, _wfId, idMaps) => {
			const connOldIds = new Set(idMaps['workflow_connections']?.keys() ?? []);
			const stageOldIds = new Set(idMaps['workflow_stages']?.keys() ?? []);
			if (connOldIds.size === 0 && stageOldIds.size === 0) return [];
			const all = await pb.collection('tools_edit').getFullList();
			return all.filter(
				(e: any) =>
					connOldIds.has(e.connection_id) ||
					(Array.isArray(e.stage_id) && e.stage_id.some((sid: string) => stageOldIds.has(sid)))
			);
		},
		remap: { connection_id: 'workflow_connections' },
		remapArrays: { stage_id: 'workflow_stages', editable_fields: 'tools_form_fields' },
		roleFields: ['allowed_roles'],
	},
	{
		collection: 'tools_automation',
		remap: { workflow_id: 'workflow' },
		transformRecord: remapAutomationJson,
	},
	{
		collection: 'tools_field_tags',
		remap: { workflow_id: 'workflow' },
		transformRecord: remapFieldTagMappings,
	},
];

// -- Generic duplication engine --

async function duplicateWorkflow(
	pb: PocketBase,
	sourceWorkflowId: string,
	targetProjectId: string
): Promise<string> {
	const source = await pb.collection('workflows').getOne(sourceWorkflowId);
	const crossProject = source.project_id !== targetProjectId;

	const newWorkflowId = generateId();
	await pb.collection('workflows').create({
		id: newWorkflowId,
		project_id: targetProjectId,
		name: `Copy of ${source.name}`,
		description: source.description || null,
		workflow_type: source.workflow_type,
		marker_color: source.marker_color || null,
		icon_config: source.icon_config || {},
		is_active: false,
		entry_allowed_roles: crossProject ? [] : (source.entry_allowed_roles || []),
		filter_value_icons: source.filter_value_icons || {},
	});

	const idMaps: IdMaps = {
		workflow: new Map([[sourceWorkflowId, newWorkflowId]]),
	};

	for (const layer of DUPLICATION_LAYERS) {
		let records: any[];
		if (layer.loadRecords) {
			records = await layer.loadRecords(pb, sourceWorkflowId, idMaps);
		} else {
			records = await pb.collection(layer.collection).getFullList({
				filter: `workflow_id = "${sourceWorkflowId}"`,
				...(layer.sort ? { sort: layer.sort } : {}),
			});
		}

		const layerMap = new Map<string, string>();
		idMaps[layer.collection] = layerMap;

		for (const record of records) {
			const newId = generateId();
			layerMap.set(record.id, newId);

			let data: any = { ...record };
			for (const field of SYSTEM_FIELDS) delete data[field];
			delete data.id;

			// Remap single-relation fields
			if (layer.remap) {
				for (const [field, sourceCollection] of Object.entries(layer.remap)) {
					if (!data[field]) continue;
					const map = idMaps[sourceCollection];
					if (map) data[field] = map.get(data[field]) ?? data[field];
				}
			}

			// Remap multi-relation (array) fields
			if (layer.remapArrays) {
				for (const [field, sourceCollection] of Object.entries(layer.remapArrays)) {
					const map = idMaps[sourceCollection];
					if (map && Array.isArray(data[field])) {
						data[field] = data[field].map((id: string) => map.get(id) ?? id);
					}
				}
			}

			// Transform JSON-embedded IDs
			if (layer.transformRecord) {
				data = layer.transformRecord(data, idMaps);
			}

			// Strip role references on cross-project duplication
			if (crossProject && layer.roleFields) {
				for (const field of layer.roleFields) data[field] = [];
			}

			data.id = newId;
			await pb.collection(layer.collection).create(data);
		}
	}

	return newWorkflowId;
}

const workflowSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	description: z.string().optional().or(z.literal('')),
	workflow_type: z.enum(['incident', 'survey']),
	is_active: z.boolean().default(true)
});

export const load: PageServerLoad = async ({ params, locals: { pb } }) => {
	const { projectId } = params;

	try {
		// Fetch workflows for this project and all projects (for import dialog)
		const [workflowsRaw, allProjects] = await Promise.all([
			pb.collection('workflows').getFullList({
				filter: `project_id = "${projectId}"`,
				sort: '-created'
			}),
			pb.collection('projects').getFullList({ sort: 'name' })
		]);

		// Normalize workflows to parse JSON array fields from TEXT columns
		const workflows = normalizeRecords(workflowsRaw, 'workflows');

		const form = await superValidate(zod(workflowSchema));

		return {
			workflows: workflows || [],
			form,
			projects: allProjects.map((p: any) => ({ id: p.id, name: p.name }))
		};
	} catch (err) {
		console.error('Error fetching workflows:', err);
		throw error(500, 'Failed to load workflows');
	}
};

export const actions: Actions = {
	create: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const form = await superValidate(request, zod(workflowSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await pb.collection('workflows').create({
				project_id: projectId,
				name: form.data.name,
				description: form.data.description || null,
				workflow_type: form.data.workflow_type,
				is_active: form.data.is_active,
				marker_color: form.data.workflow_type === 'incident' ? '#ff0000' : null,
				icon_config: {}
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error creating workflow:', err);
			return fail(500, {
				form,
				message: 'Failed to create workflow'
			});
		}
	},

	update: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const workflowId = formData.get('id') as string;

		const form = await superValidate(formData, zod(workflowSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await pb.collection('workflows').update(workflowId, {
				name: form.data.name,
				description: form.data.description || null,
				workflow_type: form.data.workflow_type,
				is_active: form.data.is_active,
				updated_at: new Date().toISOString()
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error updating workflow:', err);
			return fail(500, {
				form,
				message: 'Failed to update workflow'
			});
		}
	},

	delete: async ({ request, params, locals: { pb } }) => {
		return await createDeleteAction(pb, params.projectId, {
			tableName: 'workflows'
		})(request);
	},

	updateField: async ({ request, params, locals: { pb } }) => {
		return await createUpdateFieldAction(pb, params.projectId, {
			tableName: 'workflows',
			allowedFields: ['name', 'description', 'workflow_type'],
			validators: {
				name: (value) => ({
					valid: value.trim().length >= 1,
					error: 'Name is required'
				}),
				workflow_type: (value) => ({
					valid: ['incident', 'survey'].includes(value),
					error: 'Invalid workflow type'
				})
			}
		})(request);
	},

	updateIconConfig: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const workflowId = formData.get('id') as string;
		const iconConfigJson = formData.get('iconConfig') as string;

		if (!workflowId) {
			return fail(400, { message: 'Workflow ID is required' });
		}

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
			// Get current visual_config to merge
			const stage = await pb.collection('workflow_stages').getOne(stageId);
			const currentVisualConfig = (stage.visual_config as Record<string, unknown>) || {};

			// Build updated config, omitting icon_config if clearing
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
		const formData = await request.formData();
		const workflowId = formData.get('id') as string;
		const iconsJson = formData.get('filterValueIcons') as string;

		if (!workflowId) {
			return fail(400, { message: 'Workflow ID is required' });
		}

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

	toggleStatus: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const workflowId = formData.get('id') as string;
		const isActive = formData.get('is_active') === 'true';

		if (!workflowId) {
			return fail(400, { message: 'Workflow ID is required' });
		}

		try {
			await pb.collection('workflows').update(workflowId, {
				is_active: isActive,
				updated_at: new Date().toISOString()
			});

			return { success: true };
		} catch (err) {
			console.error('Error toggling workflow status:', err);
			return fail(500, { message: 'Failed to update status' });
		}
	},

	duplicate: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const sourceWorkflowId = formData.get('id') as string;
		const { projectId } = params;

		if (!sourceWorkflowId) {
			return fail(400, { message: 'Workflow ID is required' });
		}

		try {
			const newId = await duplicateWorkflow(pb, sourceWorkflowId, projectId);
			return { success: true, duplicatedWorkflowId: newId };
		} catch (err) {
			console.error('Error duplicating workflow:', err);
			return fail(500, { message: 'Failed to duplicate workflow' });
		}
	},

	importFromProject: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const sourceWorkflowId = formData.get('sourceWorkflowId') as string;
		const { projectId } = params;

		if (!sourceWorkflowId) {
			return fail(400, { message: 'Source workflow ID is required' });
		}

		try {
			const newId = await duplicateWorkflow(pb, sourceWorkflowId, projectId);
			return { success: true, importedWorkflowId: newId };
		} catch (err) {
			console.error('Error importing workflow:', err);
			return fail(500, { message: 'Failed to import workflow' });
		}
	}
};
