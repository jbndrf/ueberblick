import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import * as m from '$lib/paraglide/messages';

const customTableSchema = z.object({
	table_name: z
		.string()
		.min(1, 'Table name is required')
		.regex(/^[a-z][a-z0-9_]*$/, 'Table name must start with a letter and contain only lowercase letters, numbers, and underscores'),
	display_name: z.string().min(1, 'Display name is required'),
	description: z.string().optional(),
	main_column: z
		.string()
		.min(1, 'Main column is required')
		.regex(/^[a-z][a-z0-9_]*$/, 'Main column must start with a letter and contain only lowercase letters, numbers, and underscores')
});

export const load: PageServerLoad = async ({ params, locals: { pb } }) => {
	const { projectId } = params;

	try {
		// Fetch custom tables and roles in parallel
		const [customTables, roles] = await Promise.all([
			pb.collection('custom_tables').getFullList({
				filter: `project_id = "${projectId}"`,
				sort: 'sort_order,-created'
			}),
			pb.collection('roles').getFullList({
				filter: `project_id = "${projectId}"`,
				sort: 'name'
			})
		]);

		// Create form for adding/editing tables
		const form = await superValidate(zod4(customTableSchema));

		return {
			customTables: customTables || [],
			roles: roles || [],
			form
		};
	} catch (err) {
		console.error('Error fetching custom tables:', err);
		throw error(500, m.customTablesServerLoadError?.() ?? 'Failed to load custom tables');
	}
};

export const actions: Actions = {
	create: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const form = await superValidate(formData, zod4(customTableSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		// Get visible_to_roles from form data (not in schema) - it's a JSON array
		const visibleToRolesJson = formData.get('visible_to_roles') as string;
		let visibleToRoles: string[] = [];
		try {
			visibleToRoles = visibleToRolesJson ? JSON.parse(visibleToRolesJson) : [];
		} catch {
			visibleToRoles = [];
		}

		try {
			await pb.collection('custom_tables').create({
				project_id: projectId,
				table_name: form.data.table_name,
				display_name: form.data.display_name,
				description: form.data.description || null,
				main_column: form.data.main_column,
				visible_to_roles: visibleToRoles
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error creating custom table:', err);
			return fail(500, {
				form,
				message: m.customTablesServerCreateError?.() ?? 'Failed to create custom table'
			});
		}
	},

	update: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const tableId = formData.get('id') as string;

		const form = await superValidate(formData, zod4(customTableSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		// Get visible_to_roles from form data (not in schema) - it's a JSON array
		const visibleToRolesJson = formData.get('visible_to_roles') as string;
		let visibleToRoles: string[] = [];
		try {
			visibleToRoles = visibleToRolesJson ? JSON.parse(visibleToRolesJson) : [];
		} catch {
			visibleToRoles = [];
		}

		try {
			await pb.collection('custom_tables').update(tableId, {
				table_name: form.data.table_name,
				display_name: form.data.display_name,
				description: form.data.description || null,
				main_column: form.data.main_column,
				visible_to_roles: visibleToRoles
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error updating custom table:', err);
			return fail(500, {
				form,
				message: m.customTablesServerUpdateError?.() ?? 'Failed to update custom table'
			});
		}
	},

	updateField: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const tableId = formData.get('id') as string;
		const field = formData.get('field') as string;
		const value = formData.get('value') as string;

		if (!tableId || !field) {
			return fail(400, { message: m.customTablesServerFieldRequired?.() ?? 'Table ID and field are required' });
		}

		// Validate allowed fields
		if (!['table_name', 'display_name', 'description', 'main_column', 'visible_to_roles'].includes(field)) {
			return fail(400, { message: m.customTablesServerInvalidField?.() ?? 'Invalid field' });
		}

		// Basic validation based on field
		if (field === 'table_name') {
			if (!value || !/^[a-z][a-z0-9_]*$/.test(value)) {
				return fail(400, { message: 'Table name must start with a letter and contain only lowercase letters, numbers, and underscores' });
			}
		}

		if (field === 'display_name' && (!value || value.trim().length < 1)) {
			return fail(400, { message: m.customTablesServerDisplayNameRequired?.() ?? 'Display name is required' });
		}

		if (field === 'main_column') {
			if (!value || !/^[a-z][a-z0-9_]*$/.test(value)) {
				return fail(400, { message: 'Main column must start with a letter and contain only lowercase letters, numbers, and underscores' });
			}
		}

		// Handle array field conversion for visible_to_roles
		let updateValue: string | string[] | null = value || null;
		if (field === 'visible_to_roles') {
			try {
				updateValue = value ? JSON.parse(value) : [];
			} catch {
				updateValue = [];
			}
		}

		const updateData: Record<string, string | string[] | null> = {
			[field]: updateValue
		};

		try {
			await pb.collection('custom_tables').update(tableId, updateData);
			return { success: true };
		} catch (err) {
			console.error('Error updating custom table field:', err);
			return fail(500, { message: m.customTablesServerUpdateError?.() ?? 'Failed to update custom table' });
		}
	},

	delete: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const tableId = formData.get('id') as string;

		if (!tableId) {
			return fail(400, { message: m.customTablesServerTableIdRequired?.() ?? 'Table ID is required' });
		}

		try {
			// First, delete all columns for this table
			const columns = await pb.collection('custom_table_columns').getFullList({
				filter: `table_id = "${tableId}"`
			});
			for (const column of columns) {
				await pb.collection('custom_table_columns').delete(column.id);
			}

			// Delete all data for this table
			const dataRows = await pb.collection('custom_table_data').getFullList({
				filter: `table_id = "${tableId}"`
			});
			for (const row of dataRows) {
				await pb.collection('custom_table_data').delete(row.id);
			}

			// Finally, delete the table itself
			await pb.collection('custom_tables').delete(tableId);

			return { success: true };
		} catch (err) {
			console.error('Error deleting custom table:', err);
			return fail(500, { message: m.customTablesServerDeleteError?.() ?? 'Failed to delete custom table' });
		}
	}
};
