import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { createUpdateFieldAction, createDeleteAction } from '$lib/server/crud-actions';
import type PocketBase from 'pocketbase';

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

		return {
			roles: roles || [],
			participants: participants || [],
			form
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
