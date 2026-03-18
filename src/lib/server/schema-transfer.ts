/**
 * Project Schema Export/Import & Workflow Duplication Engine
 *
 * Config-driven system for copying project entities with automatic ID remapping.
 * Handles relation fields, multi-relation arrays, and JSON-embedded IDs.
 */
import type PocketBase from 'pocketbase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IdMaps = Record<string, Map<string, string>>;

export type DuplicationLayer = {
	collection: string;
	sort?: string;
	/** How to load records. If absent, filters by the key determined by context. */
	loadRecords?: (pb: PocketBase, parentId: string, idMaps: IdMaps) => Promise<any[]>;
	/** Single-relation fields to remap: { fieldName: idMapsKey } */
	remap?: Record<string, string>;
	/** Multi-relation (array) fields to remap: { fieldName: idMapsKey } */
	remapArrays?: Record<string, string>;
	/** Hook for remapping IDs embedded inside JSON fields. */
	transformRecord?: (record: any, idMaps: IdMaps) => any;
	/** Fields referencing role IDs -- cleared to [] on cross-project import. */
	roleFields?: string[];
};

export type ProjectSchemaExport = {
	version: 1;
	exported_at: string;
	source_project: { name: string; description: string };
	roles: any[];
	workflows: WorkflowExport[];
	custom_tables: CustomTableExport[];
	map_layers: any[];
	marker_categories: any[];
	offline_packages: any[];
};

type WorkflowExport = {
	record: any;
	stages: any[];
	connections: any[];
	forms: any[];
	form_fields: any[];
	edit_tools: any[];
	protocol_tools: any[];
	automations: any[];
	field_tags: any[];
};

type CustomTableExport = {
	record: any;
	columns: any[];
};

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

const SYSTEM_FIELDS = ['collectionId', 'collectionName', 'created', 'updated'];

export function generateId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 15 }, () =>
		chars[Math.floor(Math.random() * chars.length)]
	).join('');
}

function stripSystemFields(record: any): any {
	const data = { ...record };
	for (const field of SYSTEM_FIELDS) delete data[field];
	return data;
}

// ---------------------------------------------------------------------------
// JSON transform hooks (for IDs embedded inside JSON fields)
// ---------------------------------------------------------------------------

export function remapFieldOptions(record: any, idMaps: IdMaps): any {
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

export function remapAutomationJson(record: any, idMaps: IdMaps): any {
	const stageMap = idMaps['workflow_stages'];
	const fieldMap = idMaps['tools_form_fields'];
	const r = (id: string | null | undefined, map?: Map<string, string>) =>
		id && map?.has(id) ? map.get(id) : id;

	let triggerConfig = record.trigger_config;
	if (triggerConfig) {
		triggerConfig = { ...triggerConfig };
		if (triggerConfig.from_stage_id) triggerConfig.from_stage_id = r(triggerConfig.from_stage_id, stageMap);
		if (triggerConfig.to_stage_id) triggerConfig.to_stage_id = r(triggerConfig.to_stage_id, stageMap);
		if (triggerConfig.stage_id) triggerConfig.stage_id = r(triggerConfig.stage_id, stageMap);
		if (triggerConfig.field_key) triggerConfig.field_key = r(triggerConfig.field_key, fieldMap);
		if (triggerConfig.target_stage_id) triggerConfig.target_stage_id = r(triggerConfig.target_stage_id, stageMap);
	}

	function remapConditions(conditions: any) {
		if (!conditions?.conditions) return conditions;
		return {
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

	function remapActions(actions: any[]) {
		return actions.map((a: any) => {
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

	let steps = record.steps;
	if (Array.isArray(steps)) {
		steps = steps.map((step: any) => ({
			...step,
			conditions: remapConditions(step.conditions),
			actions: Array.isArray(step.actions) ? remapActions(step.actions) : step.actions
		}));
	}

	return { ...record, trigger_config: triggerConfig, steps };
}

export function remapFieldTagMappings(record: any, idMaps: IdMaps): any {
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

function remapMarkerCategoryRoles(record: any, idMaps: IdMaps): any {
	const roleMap = idMaps['roles'];
	if (!record.visible_to_roles || !roleMap) return record;
	if (Array.isArray(record.visible_to_roles)) {
		return {
			...record,
			visible_to_roles: record.visible_to_roles.map((id: string) => roleMap.get(id) ?? id)
		};
	}
	return record;
}

// ---------------------------------------------------------------------------
// Workflow duplication layers
// ---------------------------------------------------------------------------

export const WORKFLOW_LAYERS: DuplicationLayer[] = [
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
		collection: 'tools_protocol',
		loadRecords: async (pb, _wfId, idMaps) => {
			const connOldIds = new Set(idMaps['workflow_connections']?.keys() ?? []);
			const stageOldIds = new Set(idMaps['workflow_stages']?.keys() ?? []);
			if (connOldIds.size === 0 && stageOldIds.size === 0) return [];
			const all = await pb.collection('tools_protocol').getFullList();
			return all.filter(
				(p: any) =>
					(p.connection_id && connOldIds.has(p.connection_id)) ||
					(Array.isArray(p.stage_id) && p.stage_id.some((sid: string) => stageOldIds.has(sid)))
			);
		},
		remap: { connection_id: 'workflow_connections', protocol_form_id: 'tools_forms' },
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

// ---------------------------------------------------------------------------
// Generic record duplication engine
// ---------------------------------------------------------------------------

async function processLayers(
	pb: PocketBase,
	layers: DuplicationLayer[],
	parentId: string,
	parentFilterField: string,
	idMaps: IdMaps,
	options?: { clearRoles?: boolean }
): Promise<void> {
	for (const layer of layers) {
		let records: any[];
		if (layer.loadRecords) {
			records = await layer.loadRecords(pb, parentId, idMaps);
		} else {
			records = await pb.collection(layer.collection).getFullList({
				filter: `${parentFilterField} = "${parentId}"`,
				...(layer.sort ? { sort: layer.sort } : {}),
			});
		}

		const layerMap = new Map<string, string>();
		idMaps[layer.collection] = layerMap;

		for (const record of records) {
			const newId = generateId();
			layerMap.set(record.id, newId);

			let data = stripSystemFields(record);

			if (layer.remap) {
				for (const [field, sourceCollection] of Object.entries(layer.remap)) {
					if (!data[field]) continue;
					const map = idMaps[sourceCollection];
					if (map) data[field] = map.get(data[field]) ?? data[field];
				}
			}

			if (layer.remapArrays) {
				for (const [field, sourceCollection] of Object.entries(layer.remapArrays)) {
					const map = idMaps[sourceCollection];
					if (map && Array.isArray(data[field])) {
						data[field] = data[field].map((id: string) => map.get(id) ?? id);
					}
				}
			}

			if (layer.transformRecord) {
				data = layer.transformRecord(data, idMaps);
			}

			if (options?.clearRoles && layer.roleFields) {
				for (const field of layer.roleFields) data[field] = [];
			}

			data.id = newId;
			await pb.collection(layer.collection).create(data);
		}
	}
}

// ---------------------------------------------------------------------------
// Workflow Duplication (used by workflows page)
// ---------------------------------------------------------------------------

export async function duplicateWorkflow(
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

	await processLayers(pb, WORKFLOW_LAYERS, sourceWorkflowId, 'workflow_id', idMaps, {
		clearRoles: crossProject,
	});

	return newWorkflowId;
}

// ---------------------------------------------------------------------------
// Project Schema Export
// ---------------------------------------------------------------------------

export async function exportProjectSchema(
	pb: PocketBase,
	projectId: string
): Promise<ProjectSchemaExport> {
	const project = await pb.collection('projects').getOne(projectId);

	// Fetch all project-level entities
	const [roles, workflows, customTables, mapLayers, markerCategories, offlinePackages] =
		await Promise.all([
			pb.collection('roles').getFullList({ filter: `project_id = "${projectId}"` }),
			pb.collection('workflows').getFullList({ filter: `project_id = "${projectId}"` }),
			pb.collection('custom_tables').getFullList({ filter: `project_id = "${projectId}"` }),
			pb.collection('map_layers').getFullList({ filter: `project_id = "${projectId}"` }),
			pb.collection('marker_categories').getFullList({ filter: `project_id = "${projectId}"` }),
			pb.collection('offline_packages').getFullList({ filter: `project_id = "${projectId}"` }),
		]);

	// Fetch workflow sub-entities for each workflow
	const workflowExports: WorkflowExport[] = [];
	for (const wf of workflows) {
		const [stages, connections, automations, fieldTags] = await Promise.all([
			pb.collection('workflow_stages').getFullList({
				filter: `workflow_id = "${wf.id}"`,
				sort: 'stage_order',
			}),
			pb.collection('workflow_connections').getFullList({
				filter: `workflow_id = "${wf.id}"`,
			}),
			pb.collection('tools_automation').getFullList({
				filter: `workflow_id = "${wf.id}"`,
			}),
			pb.collection('tools_field_tags').getFullList({
				filter: `workflow_id = "${wf.id}"`,
			}),
		]);

		const forms = await pb.collection('tools_forms').getFullList({
			filter: `workflow_id = "${wf.id}"`,
		});

		let formFields: any[] = [];
		if (forms.length > 0) {
			const allFormFields = await pb
				.collection('tools_form_fields')
				.getFullList({ sort: 'field_order' });
			const formIds = new Set(forms.map((f: any) => f.id));
			formFields = allFormFields.filter((f: any) => formIds.has(f.form_id));
		}

		// Load edit tools by connection/stage references
		let editTools: any[] = [];
		let protocolTools: any[] = [];
		if (connections.length > 0 || stages.length > 0) {
			const connIds = new Set(connections.map((c: any) => c.id));
			const stageIds = new Set(stages.map((s: any) => s.id));
			const allEditTools = await pb.collection('tools_edit').getFullList();
			editTools = allEditTools.filter(
				(e: any) =>
					connIds.has(e.connection_id) ||
					(Array.isArray(e.stage_id) && e.stage_id.some((sid: string) => stageIds.has(sid)))
			);

			const allProtocolTools = await pb.collection('tools_protocol').getFullList();
			protocolTools = allProtocolTools.filter(
				(p: any) =>
					(p.connection_id && connIds.has(p.connection_id)) ||
					(Array.isArray(p.stage_id) && p.stage_id.some((sid: string) => stageIds.has(sid)))
			);
		}

		workflowExports.push({
			record: stripSystemFields(wf),
			stages: stages.map(stripSystemFields),
			connections: connections.map(stripSystemFields),
			forms: forms.map(stripSystemFields),
			form_fields: formFields.map(stripSystemFields),
			edit_tools: editTools.map(stripSystemFields),
			protocol_tools: protocolTools.map(stripSystemFields),
			automations: automations.map(stripSystemFields),
			field_tags: fieldTags.map(stripSystemFields),
		});
	}

	// Fetch custom table columns
	const customTableExports: CustomTableExport[] = [];
	for (const table of customTables) {
		const columns = await pb.collection('custom_table_columns').getFullList({
			filter: `table_id = "${table.id}"`,
			sort: 'sort_order',
		});
		customTableExports.push({
			record: stripSystemFields(table),
			columns: columns.map(stripSystemFields),
		});
	}

	return {
		version: 1,
		exported_at: new Date().toISOString(),
		source_project: {
			name: project.name,
			description: project.description || '',
		},
		roles: roles.map(stripSystemFields),
		workflows: workflowExports,
		custom_tables: customTableExports,
		map_layers: mapLayers.map((l: any) => {
			const data = stripSystemFields(l);
			// Strip file/binary fields that can't be exported
			delete data.bounds;
			return data;
		}),
		marker_categories: markerCategories.map(stripSystemFields),
		offline_packages: offlinePackages.map((p: any) => {
			const data = stripSystemFields(p);
			// Strip archive file -- just keep metadata
			delete data.archive_file;
			delete data.file_size_bytes;
			delete data.tile_count;
			data.status = 'draft';
			return data;
		}),
	};
}

// ---------------------------------------------------------------------------
// Project Schema Import
// ---------------------------------------------------------------------------

export async function importProjectSchema(
	pb: PocketBase,
	schema: ProjectSchemaExport,
	ownerId: string,
	nameOverride?: string
): Promise<string> {
	if (schema.version !== 1) {
		throw new Error(`Unsupported schema version: ${schema.version}`);
	}

	const idMaps: IdMaps = {};

	// 1. Create project
	const newProjectId = generateId();
	await pb.collection('projects').create({
		id: newProjectId,
		name: nameOverride || `${schema.source_project.name} (imported)`,
		description: schema.source_project.description || null,
		owner_id: ownerId,
		is_active: false,
	});

	// 2. Create roles
	const roleMap = new Map<string, string>();
	idMaps['roles'] = roleMap;
	for (const role of schema.roles) {
		const newId = generateId();
		roleMap.set(role.id, newId);
		await pb.collection('roles').create({
			id: newId,
			project_id: newProjectId,
			name: role.name,
			description: role.description || null,
		});
	}

	// 3. Create custom tables + columns
	const tableMap = new Map<string, string>();
	idMaps['custom_tables'] = tableMap;
	const columnMap = new Map<string, string>();
	idMaps['custom_table_columns'] = columnMap;

	for (const tableExport of schema.custom_tables) {
		const newTableId = generateId();
		tableMap.set(tableExport.record.id, newTableId);

		const tableData = { ...tableExport.record };
		delete tableData.id;
		tableData.project_id = newProjectId;
		if (Array.isArray(tableData.visible_to_roles)) {
			tableData.visible_to_roles = tableData.visible_to_roles.map(
				(id: string) => roleMap.get(id) ?? id
			);
		}
		tableData.id = newTableId;
		await pb.collection('custom_tables').create(tableData);

		for (const col of tableExport.columns) {
			const newColId = generateId();
			columnMap.set(col.id, newColId);
			const colData = { ...col };
			delete colData.id;
			colData.table_id = newTableId;
			colData.id = newColId;
			await pb.collection('custom_table_columns').create(colData);
		}
	}

	// 4. Create map layers
	const layerMap = new Map<string, string>();
	idMaps['map_layers'] = layerMap;
	for (const layer of schema.map_layers) {
		const newId = generateId();
		layerMap.set(layer.id, newId);
		const data = { ...layer };
		delete data.id;
		data.project_id = newProjectId;
		if (Array.isArray(data.visible_to_roles)) {
			data.visible_to_roles = data.visible_to_roles.map(
				(id: string) => roleMap.get(id) ?? id
			);
		}
		data.id = newId;
		await pb.collection('map_layers').create(data);
	}

	// 5. Create marker categories
	const catMap = new Map<string, string>();
	idMaps['marker_categories'] = catMap;
	for (const cat of schema.marker_categories) {
		const newId = generateId();
		catMap.set(cat.id, newId);
		let data = { ...cat };
		delete data.id;
		data.project_id = newProjectId;
		data = remapMarkerCategoryRoles(data, idMaps);
		data.id = newId;
		await pb.collection('marker_categories').create(data);
	}

	// 6. Create offline packages
	for (const pkg of schema.offline_packages) {
		const newId = generateId();
		const data = { ...pkg };
		delete data.id;
		data.project_id = newProjectId;
		if (Array.isArray(data.layers)) {
			data.layers = data.layers.map((id: string) => layerMap.get(id) ?? id);
		}
		data.id = newId;
		await pb.collection('offline_packages').create(data);
	}

	// 7. Create workflows with all sub-entities
	for (const wfExport of schema.workflows) {
		const newWorkflowId = generateId();
		const wfData = { ...wfExport.record };
		delete wfData.id;
		wfData.project_id = newProjectId;
		wfData.is_active = false;
		// Remap role references
		if (Array.isArray(wfData.entry_allowed_roles)) {
			wfData.entry_allowed_roles = wfData.entry_allowed_roles.map(
				(id: string) => roleMap.get(id) ?? id
			);
		}
		if (Array.isArray(wfData.visible_to_roles)) {
			wfData.visible_to_roles = wfData.visible_to_roles.map(
				(id: string) => roleMap.get(id) ?? id
			);
		}
		wfData.id = newWorkflowId;
		await pb.collection('workflows').create(wfData);

		// Build workflow-specific ID maps
		const wfIdMaps: IdMaps = {
			...idMaps,
			workflow: new Map([[wfExport.record.id, newWorkflowId]]),
		};

		// Stages
		const stageMap = new Map<string, string>();
		wfIdMaps['workflow_stages'] = stageMap;
		for (const stage of wfExport.stages) {
			const newId = generateId();
			stageMap.set(stage.id, newId);
			const data = { ...stage };
			delete data.id;
			data.workflow_id = newWorkflowId;
			if (Array.isArray(data.visible_to_roles)) {
				data.visible_to_roles = data.visible_to_roles.map(
					(id: string) => roleMap.get(id) ?? id
				);
			}
			data.id = newId;
			await pb.collection('workflow_stages').create(data);
		}

		// Connections
		const connMap = new Map<string, string>();
		wfIdMaps['workflow_connections'] = connMap;
		for (const conn of wfExport.connections) {
			const newId = generateId();
			connMap.set(conn.id, newId);
			const data = { ...conn };
			delete data.id;
			data.workflow_id = newWorkflowId;
			if (data.from_stage_id) data.from_stage_id = stageMap.get(data.from_stage_id) ?? data.from_stage_id;
			data.to_stage_id = stageMap.get(data.to_stage_id) ?? data.to_stage_id;
			if (Array.isArray(data.allowed_roles)) {
				data.allowed_roles = data.allowed_roles.map(
					(id: string) => roleMap.get(id) ?? id
				);
			}
			data.id = newId;
			await pb.collection('workflow_connections').create(data);
		}

		// Forms
		const formMap = new Map<string, string>();
		wfIdMaps['tools_forms'] = formMap;
		for (const form of wfExport.forms) {
			const newId = generateId();
			formMap.set(form.id, newId);
			const data = { ...form };
			delete data.id;
			data.workflow_id = newWorkflowId;
			if (data.connection_id) data.connection_id = connMap.get(data.connection_id) ?? data.connection_id;
			if (data.stage_id) data.stage_id = stageMap.get(data.stage_id) ?? data.stage_id;
			if (Array.isArray(data.allowed_roles)) {
				data.allowed_roles = data.allowed_roles.map(
					(id: string) => roleMap.get(id) ?? id
				);
			}
			data.id = newId;
			await pb.collection('tools_forms').create(data);
		}

		// Form fields
		const fieldMap = new Map<string, string>();
		wfIdMaps['tools_form_fields'] = fieldMap;
		for (const field of wfExport.form_fields) {
			const newId = generateId();
			fieldMap.set(field.id, newId);
			let data = { ...field };
			delete data.id;
			data.form_id = formMap.get(data.form_id) ?? data.form_id;
			data = remapFieldOptions(data, wfIdMaps);
			data.id = newId;
			await pb.collection('tools_form_fields').create(data);
		}

		// Edit tools
		for (const edit of wfExport.edit_tools) {
			const newId = generateId();
			const data = { ...edit };
			delete data.id;
			if (data.connection_id) data.connection_id = connMap.get(data.connection_id) ?? data.connection_id;
			if (Array.isArray(data.stage_id)) {
				data.stage_id = data.stage_id.map((id: string) => stageMap.get(id) ?? id);
			}
			if (Array.isArray(data.editable_fields)) {
				data.editable_fields = data.editable_fields.map(
					(id: string) => fieldMap.get(id) ?? id
				);
			}
			if (Array.isArray(data.allowed_roles)) {
				data.allowed_roles = data.allowed_roles.map(
					(id: string) => roleMap.get(id) ?? id
				);
			}
			data.id = newId;
			await pb.collection('tools_edit').create(data);
		}

		// Protocol tools
		for (const proto of (wfExport.protocol_tools || [])) {
			const newId = generateId();
			const data = { ...proto };
			delete data.id;
			if (data.connection_id) data.connection_id = connMap.get(data.connection_id) ?? data.connection_id;
			if (data.protocol_form_id) data.protocol_form_id = formMap.get(data.protocol_form_id) ?? data.protocol_form_id;
			if (Array.isArray(data.stage_id)) {
				data.stage_id = data.stage_id.map((id: string) => stageMap.get(id) ?? id);
			}
			if (Array.isArray(data.editable_fields)) {
				data.editable_fields = data.editable_fields.map(
					(id: string) => fieldMap.get(id) ?? id
				);
			}
			if (Array.isArray(data.allowed_roles)) {
				data.allowed_roles = data.allowed_roles.map(
					(id: string) => roleMap.get(id) ?? id
				);
			}
			data.id = newId;
			await pb.collection('tools_protocol').create(data);
		}

		// Automations
		for (const auto of wfExport.automations) {
			const newId = generateId();
			let data = { ...auto };
			delete data.id;
			data.workflow_id = newWorkflowId;
			data = remapAutomationJson(data, wfIdMaps);
			data.id = newId;
			await pb.collection('tools_automation').create(data);
		}

		// Field tags
		for (const tag of wfExport.field_tags) {
			const newId = generateId();
			let data = { ...tag };
			delete data.id;
			data.workflow_id = newWorkflowId;
			data = remapFieldTagMappings(data, wfIdMaps);
			data.id = newId;
			await pb.collection('tools_field_tags').create(data);
		}
	}

	return newProjectId;
}
