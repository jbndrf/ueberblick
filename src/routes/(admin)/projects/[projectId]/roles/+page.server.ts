import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { createUpdateFieldAction, createDeleteAction } from '$lib/server/crud-actions';
import type PocketBase from 'pocketbase';

type StagePermissions = {
	id: string;
	name: string;
	order: number;
	visibleToRoles: string[];
	connections: Array<{ id: string; actionName: string; allowedRoles: string[] }>;
	forms: Array<{ id: string; name: string; allowedRoles: string[]; fromConnection: boolean }>;
	editTools: Array<{ id: string; name: string; allowedRoles: string[] }>;
};

type WorkflowPermissions = {
	id: string;
	name: string;
	workflowType: string;
	isActive: boolean;
	privateInstances: boolean;
	visibleToRoles: string[];
	entryAllowedRoles: string[];
	stages: StagePermissions[];
	globalTools: Array<{ id: string; name: string; allowedRoles: string[] }>;
};

type EntityPermissions = {
	id: string;
	name: string;
	visibleToRoles: string[];
};

async function loadPermissionsData(pb: PocketBase, projectId: string) {
	const [workflows, customTables, markerCategories, mapLayers, offlinePackages] =
		await Promise.all([
			pb.collection('workflows').getFullList({
				filter: `project_id = "${projectId}"`,
				fields: 'id,name,workflow_type,is_active,visible_to_roles,entry_allowed_roles,private_instances',
				sort: 'name'
			}),
			pb.collection('custom_tables').getFullList({
				filter: `project_id = "${projectId}"`,
				fields: 'id,display_name,visible_to_roles',
				sort: 'display_name'
			}),
			pb.collection('marker_categories').getFullList({
				filter: `project_id = "${projectId}"`,
				fields: 'id,name,visible_to_roles',
				sort: 'name'
			}),
			pb.collection('map_layers').getFullList({
				filter: `project_id = "${projectId}"`,
				fields: 'id,name,visible_to_roles',
				sort: 'name'
			}),
			pb.collection('offline_packages').getFullList({
				filter: `project_id = "${projectId}"`,
				fields: 'id,name,visible_to_roles',
				sort: 'name'
			})
		]);

	const workflowIds = workflows.map((w) => w.id);
	let stages: any[] = [];
	let connections: any[] = [];
	let forms: any[] = [];
	let editTools: any[] = [];

	if (workflowIds.length > 0) {
		const wfFilter = workflowIds.map((id) => `workflow_id = "${id}"`).join(' || ');

		[stages, connections, forms] = await Promise.all([
			pb.collection('workflow_stages').getFullList({
				filter: wfFilter,
				fields: 'id,workflow_id,stage_name,stage_order,visible_to_roles',
				sort: 'stage_order'
			}),
			pb.collection('workflow_connections').getFullList({
				filter: wfFilter,
				fields: 'id,workflow_id,action_name,allowed_roles,from_stage_id'
			}),
			pb.collection('tools_forms').getFullList({
				filter: wfFilter,
				fields: 'id,workflow_id,name,allowed_roles,connection_id,stage_id'
			})
		]);

		const connectionIds = connections.map((c) => c.id);
		const stageIds = stages.map((s) => s.id);

		if (connectionIds.length > 0 || stageIds.length > 0) {
			const editToolFilters: string[] = [];
			if (connectionIds.length > 0) {
				editToolFilters.push(
					connectionIds.map((id) => `connection_id = "${id}"`).join(' || ')
				);
			}
			if (stageIds.length > 0) {
				editToolFilters.push(
					stageIds.map((id) => `stage_id ?= "${id}"`).join(' || ')
				);
			}
			editTools = await pb.collection('tools_edit').getFullList({
				filter: editToolFilters.join(' || '),
				fields: 'id,name,allowed_roles,connection_id,stage_id,is_global'
			});
		}
	}

	// Index connections by from_stage_id
	const connectionsByFromStage = new Map<string, any[]>();
	for (const c of connections) {
		if (c.from_stage_id) {
			const arr = connectionsByFromStage.get(c.from_stage_id) || [];
			arr.push(c);
			connectionsByFromStage.set(c.from_stage_id, arr);
		}
	}

	// Index forms by stage_id and connection_id
	const formsByStage = new Map<string, any[]>();
	for (const f of forms) {
		if (f.connection_id) {
			// connection-attached forms are covered by the connection row
		} else if (f.stage_id) {
			const arr = formsByStage.get(f.stage_id) || [];
			arr.push(f);
			formsByStage.set(f.stage_id, arr);
		}
	}

	// Index edit tools
	const editToolsByStage = new Map<string, any[]>();
	const globalEditTools: any[] = [];
	for (const et of editTools) {
		if (et.is_global) {
			globalEditTools.push(et);
			continue;
		}
		if (et.connection_id) {
			// connection-attached edit tools are covered by the connection row
		}
		if (et.stage_id) {
			const stageIdList = Array.isArray(et.stage_id) ? et.stage_id : [et.stage_id];
			for (const sid of stageIdList) {
				const arr = editToolsByStage.get(sid) || [];
				arr.push(et);
				editToolsByStage.set(sid, arr);
			}
		}
	}

	// Build workflow permissions with full hierarchy
	const workflowPermissions: WorkflowPermissions[] = workflows.map((wf) => {
		const wfStages = (stages.filter((s) => s.workflow_id === wf.id) || [])
			.sort((a: any, b: any) => (a.stage_order ?? 0) - (b.stage_order ?? 0));

		const stagePerms: StagePermissions[] = wfStages.map((stage: any) => {
			const stageConnections = connectionsByFromStage.get(stage.id) || [];
			const stageForms: StagePermissions['forms'] = [];
			for (const f of formsByStage.get(stage.id) || []) {
				stageForms.push({
					id: f.id,
					name: f.name as string,
					allowedRoles: f.allowed_roles || [],
					fromConnection: false
				});
			}
			const stageEditTools: StagePermissions['editTools'] = [];
			for (const et of editToolsByStage.get(stage.id) || []) {
				stageEditTools.push({
					id: et.id,
					name: et.name as string,
					allowedRoles: et.allowed_roles || []
				});
			}

			return {
				id: stage.id,
				name: stage.stage_name as string,
				order: stage.stage_order as number,
				visibleToRoles: stage.visible_to_roles || [],
				connections: stageConnections.map((c: any) => ({
					id: c.id,
					actionName: c.action_name as string,
					allowedRoles: c.allowed_roles || []
				})),
				forms: stageForms,
				editTools: stageEditTools
			};
		});

		const wfGlobalTools = globalEditTools
			.filter((et) => {
				const stageIdList = Array.isArray(et.stage_id) ? et.stage_id : [et.stage_id];
				return stageIdList.some((sid: string) => wfStages.some((s: any) => s.id === sid));
			})
			.map((et) => ({
				id: et.id,
				name: et.name as string,
				allowedRoles: et.allowed_roles || []
			}));

		return {
			id: wf.id,
			name: wf.name as string,
			workflowType: wf.workflow_type as string,
			isActive: wf.is_active as boolean,
			privateInstances: (wf.private_instances as boolean) || false,
			visibleToRoles: (wf.visible_to_roles as string[]) || [],
			entryAllowedRoles: (wf.entry_allowed_roles as string[]) || [],
			stages: stagePerms,
			globalTools: wfGlobalTools
		};
	});

	return {
		permWorkflows: workflowPermissions,
		permTables: customTables.map((t) => ({
			id: t.id,
			name: t.display_name as string,
			visibleToRoles: (t.visible_to_roles as string[]) || []
		})) as EntityPermissions[],
		permCategories: markerCategories.map((c) => ({
			id: c.id,
			name: c.name as string,
			visibleToRoles: (c.visible_to_roles as string[]) || []
		})) as EntityPermissions[],
		permLayers: mapLayers.map((l) => ({
			id: l.id,
			name: l.name as string,
			visibleToRoles: (l.visible_to_roles as string[]) || []
		})) as EntityPermissions[],
		permPackages: offlinePackages.map((p) => ({
			id: p.id,
			name: p.name as string,
			visibleToRoles: (p.visible_to_roles as string[]) || []
		})) as EntityPermissions[]
	};
}

/**
 * Cleanup before deleting a role - remove role from all participants and visibility settings
 */
async function cleanupRoleReferences(
	pb: PocketBase,
	roleId: string,
	projectId: string
) {
	// Remove this role from all assigned participants
	const participantsWithRole = await pb.collection('participants').getFullList({
		filter: `project_id = "${projectId}" && role_id ?~ "${roleId}"`
	});

	if (participantsWithRole && participantsWithRole.length > 0) {
		for (const participant of participantsWithRole) {
			const updatedRoleIds = (participant.role_id || []).filter((id: string) => id !== roleId);
			await pb.collection('participants').update(participant.id, {
				role_id: updatedRoleIds.length > 0 ? updatedRoleIds : null
			});
		}
	}

	// Remove this role from tile_sets visible_to_roles
	const tileSetsWithRole = await pb.collection('tile_sets').getFullList({
		filter: `project_id = "${projectId}" && visible_to_roles ?~ "${roleId}"`
	});

	if (tileSetsWithRole && tileSetsWithRole.length > 0) {
		for (const tileSet of tileSetsWithRole) {
			const updatedRoles = (tileSet.visible_to_roles || []).filter((id: string) => id !== roleId);
			await pb.collection('tile_sets').update(tileSet.id, {
				visible_to_roles: updatedRoles.length > 0 ? updatedRoles : null
			});
		}
	}

	// Remove this role from map_layers visible_to_roles
	const mapLayersWithRole = await pb.collection('map_layers').getFullList({
		filter: `project_id = "${projectId}" && visible_to_roles ?~ "${roleId}"`
	});

	if (mapLayersWithRole && mapLayersWithRole.length > 0) {
		for (const layer of mapLayersWithRole) {
			const updatedRoles = (layer.visible_to_roles || []).filter((id: string) => id !== roleId);
			await pb.collection('map_layers').update(layer.id, {
				visible_to_roles: updatedRoles.length > 0 ? updatedRoles : null
			});
		}
	}
}

const roleSchema = z.object({
	name: z.string().min(2, 'Role name must be at least 2 characters'),
	description: z.string().optional()
});

export const load: PageServerLoad = async ({ params, locals: { pb } }) => {
	const { projectId } = params;

	try {
		// Fetch roles for this project
		const roles = await pb.collection('roles').getFullList({
			filter: `project_id = "${projectId}"`,
			sort: '-created'
		});

		// Fetch participants to show role assignments
		const participants = await pb.collection('participants').getFullList({
			filter: `project_id = "${projectId}"`,
			fields: 'id, name, email, phone, role_id, is_active'
		});

		// Create form for adding/editing roles
		const form = await superValidate(zod(roleSchema));

		// Load permissions data in parallel
		const permissions = await loadPermissionsData(pb, projectId);

		return {
			roles: roles || [],
			participants: participants || [],
			form,
			...permissions
		};
	} catch (err) {
		console.error('Error loading roles:', err);
		throw error(500, 'Failed to load roles');
	}
};

export const actions: Actions = {
	create: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const form = await superValidate(request, zod(roleSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await pb.collection('roles').create({
				project_id: projectId,
				name: form.data.name,
				description: form.data.description || null
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error creating role:', err);
			return fail(500, {
				form,
				message: 'Failed to create role'
			});
		}
	},

	update: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const roleId = formData.get('id') as string;

		const form = await superValidate(formData, zod(roleSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await pb.collection('roles').update(roleId, {
				name: form.data.name,
				description: form.data.description || null
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error updating role:', err);
			return fail(500, {
				form,
				message: 'Failed to update role'
			});
		}
	},

	updateField: async ({ request, params, locals: { pb } }) => {
		return await createUpdateFieldAction(pb, params.projectId, {
			tableName: 'roles',
			allowedFields: ['name', 'description'],
			validators: {
				name: (value) => ({
					valid: value.trim().length >= 2,
					error: 'Name must be at least 2 characters'
				})
			}
		})(request);
	},

	delete: async ({ request, params, locals: { pb } }) => {
		return await createDeleteAction(pb, params.projectId, {
			tableName: 'roles',
			beforeDelete: cleanupRoleReferences
		})(request);
	},

	updateParticipants: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const roleId = formData.get('roleId') as string;
		const participantIdsJson = formData.get('participantIds') as string;

		if (!roleId || !participantIdsJson) {
			return fail(400, { message: 'Role ID and participant IDs are required' });
		}

		let participantIds: string[];
		try {
			participantIds = JSON.parse(participantIdsJson);
		} catch {
			return fail(400, { message: 'Invalid participant IDs format' });
		}

		try {
			// Get all participants in this project
			const allParticipants = await pb.collection('participants').getFullList({
				filter: `project_id = "${params.projectId}"`,
				fields: 'id, role_id'
			});

			// Update each participant's role_id array
			for (const participant of allParticipants || []) {
				const currentRoleIds = (participant.role_id || []) as string[];
				const shouldHaveRole = participantIds.includes(participant.id);
				const hasRole = currentRoleIds.includes(roleId);

				// If the participant should have this role but doesn't, add it
				if (shouldHaveRole && !hasRole) {
					const newRoleIds = [...currentRoleIds, roleId];
					await pb.collection('participants').update(participant.id, {
						role_id: newRoleIds
					});
				}
				// If the participant has this role but shouldn't, remove it
				else if (!shouldHaveRole && hasRole) {
					const newRoleIds = currentRoleIds.filter((id) => id !== roleId);
					await pb.collection('participants').update(participant.id, {
						role_id: newRoleIds.length > 0 ? newRoleIds : null
					});
				}
			}

			return { success: true };
		} catch (err) {
			console.error('Error updating participant roles:', err);
			return fail(500, { message: 'Failed to update participant roles' });
		}
	},

	toggleRole: async ({ request, locals: { pb } }) => {
		const formData = await request.formData();
		const collection = formData.get('collection') as string;
		const recordId = formData.get('recordId') as string;
		const field = formData.get('field') as string;
		const roleId = formData.get('roleId') as string;
		const allRoleIds: string[] = JSON.parse(formData.get('allRoleIds') as string);

		const ALLOWED_TOGGLES: Record<string, string[]> = {
			workflows: ['visible_to_roles', 'entry_allowed_roles'],
			workflow_stages: ['visible_to_roles'],
			workflow_connections: ['allowed_roles'],
			tools_forms: ['allowed_roles'],
			tools_edit: ['allowed_roles'],
			custom_tables: ['visible_to_roles'],
			marker_categories: ['visible_to_roles'],
			map_layers: ['visible_to_roles'],
			offline_packages: ['visible_to_roles']
		};

		if (!ALLOWED_TOGGLES[collection]?.includes(field)) {
			return fail(400, { message: 'Invalid collection/field' });
		}

		try {
			const record = await pb.collection(collection).getOne(recordId);
			const currentRoles: string[] = record[field] || [];
			const hasRole = currentRoles.includes(roleId);

			let newRoles: string[];
			if (currentRoles.length === 0) {
				newRoles = allRoleIds.filter((id) => id !== roleId);
			} else if (hasRole) {
				newRoles = currentRoles.filter((id) => id !== roleId);
				if (newRoles.length >= allRoleIds.length) newRoles = [];
			} else {
				newRoles = [...currentRoles, roleId];
				if (allRoleIds.every((id) => newRoles.includes(id))) newRoles = [];
			}

			await pb.collection(collection).update(recordId, { [field]: newRoles });
			return { success: true };
		} catch (err) {
			console.error('Error toggling role:', err);
			return fail(500, { message: 'Failed to toggle role' });
		}
	},

	createParticipant: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const name = formData.get('name') as string;

		if (!name) {
			return fail(400, { message: 'Participant name is required' });
		}

		// Generate unique token
		const timestamp = Date.now().toString(36);
		const randomPart = Math.random().toString(36).substring(2, 15);
		const token = `${timestamp}-${randomPart}`;

		// Generate placeholder email
		const existingCount = await pb.collection('participants').getList(1, 1, {
			filter: `project_id = "${projectId}"`
		});
		const nextNumber = existingCount.totalItems + 1;
		const email = `participant${nextNumber}@placeholder.local`;

		try {
			const newParticipant = await pb.collection('participants').create({
				project_id: projectId,
				name: name,
				email: email,
				emailVisibility: true,
				token: token,
				is_active: true,
				password: token,
				passwordConfirm: token
			});

			return { success: true, entity: newParticipant };
		} catch (error) {
			console.error('Error creating participant:', error);
			return fail(500, { message: 'Failed to create participant' });
		}
	}
};
