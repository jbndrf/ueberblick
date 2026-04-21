import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { normalizeRecords } from '$lib/server/pocketbase-helpers';
import * as m from '$lib/paraglide/messages';

const markerCategorySchema = z.object({
	name: z.string().min(1, m.markerCategoriesServerNameRequired?.() ?? 'Category name is required'),
	description: z.string().optional()
});

export const load: PageServerLoad = async ({ params, locals: { pb } }) => {
	const { projectId } = params;

	try {
		// Fetch marker categories for this project
		const markerCategoriesRaw = await pb.collection('marker_categories').getFullList({
			filter: `project_id = "${projectId}"`,
			sort: '-created'
		});

		// Normalize marker categories to parse JSON array fields from TEXT columns
		const markerCategories = normalizeRecords(markerCategoriesRaw, 'marker_categories');

		// Fetch roles for this project
		const roles = await pb.collection('roles').getFullList({
			filter: `project_id = "${projectId}"`,
			fields: 'id, name, description',
			sort: 'name'
		});

		// Create form for adding/editing categories
		const form = await superValidate(zod4(markerCategorySchema));

		return {
			markerCategories: markerCategories || [],
			roles: roles || [],
			form
		};
	} catch (err) {
		console.error('Error fetching marker categories:', err);
		throw error(500, m.markerCategoriesServerFailedLoad?.() ?? 'Failed to load marker categories');
	}
};

export const actions: Actions = {
	create: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const form = await superValidate(request, zod4(markerCategorySchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await pb.collection('marker_categories').create({
				project_id: projectId,
				name: form.data.name,
				description: form.data.description || null,
				icon_config: {},
				visible_to_roles: [],
				fields: []
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error creating marker category:', err);
			return fail(500, {
				form,
				message: m.markerCategoriesServerFailedCreate?.() ?? 'Failed to create marker category'
			});
		}
	},

	update: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const categoryId = formData.get('id') as string;

		const form = await superValidate(formData, zod4(markerCategorySchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await pb.collection('marker_categories').update(categoryId, {
				name: form.data.name,
				description: form.data.description || null
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error updating marker category:', err);
			return fail(500, {
				form,
				message: m.markerCategoriesServerFailedUpdate?.() ?? 'Failed to update marker category'
			});
		}
	},

	updateField: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const categoryId = formData.get('id') as string;
		const field = formData.get('field') as string;
		const value = formData.get('value') as string;

		if (!categoryId || !field) {
			return fail(400, { message: m.markerCategoriesServerCategoryFieldRequired?.() ?? 'Category ID and field are required' });
		}

		// Validate allowed fields
		if (!['name', 'description'].includes(field)) {
			return fail(400, { message: m.markerCategoriesServerInvalidField?.() ?? 'Invalid field' });
		}

		// Basic validation based on field
		if (field === 'name' && (!value || value.trim().length < 1)) {
			return fail(400, { message: m.markerCategoriesServerNameRequired?.() ?? 'Category name is required' });
		}

		const updateData: Record<string, string | null> = {
			[field]: value || null
		};

		try {
			await pb.collection('marker_categories').update(categoryId, updateData);
			return { success: true };
		} catch (err) {
			console.error('Error updating marker category field:', err);
			return fail(500, { message: m.markerCategoriesServerFailedUpdate?.() ?? 'Failed to update marker category' });
		}
	},

	delete: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const categoryId = formData.get('id') as string;

		if (!categoryId) {
			return fail(400, { message: m.markerCategoriesServerCategoryRequired?.() ?? 'Category ID is required' });
		}

		try {
			// First, check if there are any markers using this category
			const markers = await pb.collection('markers').getList(1, 1, {
				filter: `category_id = "${categoryId}"`
			});

			if (markers && markers.items.length > 0) {
				return fail(400, {
					message: m.markerCategoriesServerCannotDeleteWithMarkers?.() ?? 'Cannot delete category with existing markers. Please delete or reassign markers first.'
				});
			}

			// Delete the category
			await pb.collection('marker_categories').delete(categoryId);
			return { success: true };
		} catch (err) {
			console.error('Error deleting marker category:', err);
			return fail(500, { message: m.markerCategoriesServerFailedDelete?.() ?? 'Failed to delete marker category' });
		}
	},

	updateIconConfig: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const categoryId = formData.get('id') as string;
		const iconConfigJson = formData.get('iconConfig') as string;

		if (!categoryId || !iconConfigJson) {
			return fail(400, { message: m.markerCategoriesServerIconConfigRequired?.() ?? 'Category ID and icon config are required' });
		}

		let iconConfig;
		try {
			iconConfig = JSON.parse(iconConfigJson);
		} catch (e) {
			return fail(400, { message: m.markerCategoriesServerInvalidIconJson?.() ?? 'Invalid icon config JSON' });
		}

		try {
			await pb.collection('marker_categories').update(categoryId, {
				icon_config: iconConfig
			});

			return { success: true };
		} catch (err) {
			console.error('Error updating icon config:', err);
			return fail(500, { message: m.markerCategoriesServerFailedUpdateIcon?.() ?? 'Failed to update icon config' });
		}
	},

	updateCategoryRoles: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const categoryId = formData.get('categoryId') as string;
		const roleIdsJson = formData.get('roleIds') as string;

		if (!categoryId) {
			return fail(400, { message: m.markerCategoriesServerCategoryRequired?.() ?? 'Category ID is required' });
		}

		let roleIds: string[] = [];
		try {
			roleIds = JSON.parse(roleIdsJson);
		} catch (error) {
			return fail(400, { message: m.markerCategoriesServerInvalidRoleFormat?.() ?? 'Invalid role IDs format' });
		}

		try {
			await pb.collection('marker_categories').update(categoryId, {
				visible_to_roles: roleIds
			});

			return { success: true };
		} catch (err) {
			console.error('Error updating category roles:', err);
			return fail(500, { message: m.markerCategoriesServerFailedUpdateRoles?.() ?? 'Failed to update category roles' });
		}
	},

	updateRoles: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const categoryId = formData.get('categoryId') as string;
		const roleIdsJson = formData.get('roleIds') as string;

		if (!categoryId) {
			return fail(400, { message: m.markerCategoriesServerCategoryRequired?.() ?? 'Category ID is required' });
		}

		let roleIds: string[] = [];
		try {
			roleIds = JSON.parse(roleIdsJson || '[]');
		} catch (e) {
			return fail(400, { message: m.markerCategoriesServerInvalidRoleFormat?.() ?? 'Invalid role IDs format' });
		}

		try {
			await pb.collection('marker_categories').update(categoryId, {
				visible_to_roles: roleIds
			});

			return { success: true };
		} catch (err) {
			console.error('Error updating marker category roles:', err);
			return fail(500, { message: m.markerCategoriesServerFailedUpdateRoles?.() ?? 'Failed to update roles' });
		}
	},

	createRole: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const name = formData.get('name') as string;

		if (!name) {
			return fail(400, { message: m.markerCategoriesServerRoleNameRequired?.() ?? 'Role name is required' });
		}

		try {
			const newRole = await pb.collection('roles').create({
				project_id: projectId,
				name: name,
				description: ''
			});

			return { success: true, entity: newRole };
		} catch (error) {
			console.error('Error creating role:', error);
			return fail(500, { message: m.markerCategoriesServerFailedCreateRole?.() ?? 'Failed to create role' });
		}
	}
};
