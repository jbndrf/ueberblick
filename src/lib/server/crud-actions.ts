import { fail } from '@sveltejs/kit';
import type PocketBase from 'pocketbase';

/**
 * Configuration for creating a generic updateField action
 */
export type UpdateFieldConfig = {
	/** Database table name */
	tableName: string;
	/** Allowed fields that can be updated */
	allowedFields: string[];
	/** Project ID parameter name (default: 'projectId') */
	projectIdParam?: string;
	/** Field-specific validators */
	validators?: Record<string, (value: string) => { valid: boolean; error?: string }>;
};

/**
 * Creates a reusable updateField action handler for inline editing
 *
 * @param supabase - Supabase client instance
 * @param projectId - Project ID for scoping
 * @param config - Configuration for the update action
 * @returns Action result with success/failure status
 *
 * @example
 * export const actions: Actions = {
 *   updateField: async ({ request, params, locals: { supabase } }) => {
 *     return await createUpdateFieldAction(supabase, params.projectId, {
 *       tableName: 'participants',
 *       allowedFields: ['name', 'email', 'phone'],
 *       validators: {
 *         name: (value) => ({ valid: value.length >= 1 }),
 *         email: (value) => ({ valid: !value || value.includes('@') })
 *       }
 *     })(request);
 *   }
 * };
 */
export function createUpdateFieldAction(
	pb: PocketBase,
	projectId: string,
	config: UpdateFieldConfig
) {
	return async (request: Request) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;
		const field = formData.get('field') as string;
		const value = formData.get('value') as string;

		if (!id || !field) {
			return fail(400, { message: 'ID and field are required' });
		}

		if (!config.allowedFields.includes(field)) {
			return fail(400, { message: 'Invalid field' });
		}

		// Run field-specific validation
		if (config.validators?.[field]) {
			const validationResult = config.validators[field](value);
			if (!validationResult.valid) {
				return fail(400, { message: validationResult.error || 'Validation failed' });
			}
		}

		const updateData: Record<string, string | null> = {
			[field]: value || null
		};

		try {
			// Verify project ownership before update if projectId is provided
			if (projectId) {
				const record = await pb.collection(config.tableName).getOne(id);
				const projectField = config.projectIdParam || 'project_id';
				if (record[projectField] !== projectId) {
					return fail(403, { message: 'Unauthorized' });
				}
			}

			await pb.collection(config.tableName).update(id, updateData);
		} catch (error) {
			console.error(`Error updating ${config.tableName} field:`, error);
			return fail(500, { message: `Failed to update ${config.tableName}` });
		}

		return { success: true };
	};
}

/**
 * Configuration for creating a generic delete action
 */
export type DeleteActionConfig = {
	/** Database table name */
	tableName: string;
	/** Project ID parameter name (default: 'projectId') */
	projectIdParam?: string;
	/** Optional: Custom cleanup logic before deletion */
	beforeDelete?: (pb: PocketBase, id: string, projectId: string) => Promise<void>;
};

/**
 * Creates a reusable delete action handler
 *
 * @param supabase - Supabase client instance
 * @param projectId - Project ID for scoping
 * @param config - Configuration for the delete action
 * @returns Action result with success/failure status
 *
 * @example
 * export const actions: Actions = {
 *   delete: async ({ request, params, locals: { supabase } }) => {
 *     return await createDeleteAction(supabase, params.projectId, {
 *       tableName: 'roles',
 *       beforeDelete: async (supabase, roleId, projectId) => {
 *         // Clean up role references before deletion
 *         await removeRoleFromParticipants(supabase, roleId, projectId);
 *       }
 *     })(request);
 *   }
 * };
 */
export function createDeleteAction(
	pb: PocketBase,
	projectId: string,
	config: DeleteActionConfig
) {
	return async (request: Request) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { message: 'ID is required' });
		}

		try {
			// Verify project ownership before deletion if projectId is provided
			if (projectId) {
				const record = await pb.collection(config.tableName).getOne(id);
				const projectField = config.projectIdParam || 'project_id';
				if (record[projectField] !== projectId) {
					return fail(403, { message: 'Unauthorized' });
				}
			}

			// Run custom cleanup if provided
			if (config.beforeDelete) {
				try {
					await config.beforeDelete(pb, id, projectId);
				} catch (error) {
					console.error('Error in beforeDelete cleanup:', error);
					return fail(500, { message: 'Failed to prepare for deletion' });
				}
			}

			await pb.collection(config.tableName).delete(id);
		} catch (error) {
			console.error(`Error deleting from ${config.tableName}:`, error);
			return fail(500, { message: `Failed to delete ${config.tableName}` });
		}

		return { success: true };
	};
}

/**
 * Configuration for custom field updates in metadata columns
 */
export type CustomFieldUpdateConfig = {
	/** Database table name */
	tableName: string;
	/** Metadata column name (default: 'metadata') */
	metadataColumn?: string;
	/** Project ID parameter name (default: 'projectId') */
	projectIdParam?: string;
};

/**
 * Creates a reusable custom field update action handler for metadata/JSON columns
 *
 * @param supabase - Supabase client instance
 * @param projectId - Project ID for scoping
 * @param config - Configuration for the custom field update
 * @returns Action result with success/failure status
 *
 * @example
 * export const actions: Actions = {
 *   updateCustomField: async ({ request, params, locals: { supabase } }) => {
 *     return await createCustomFieldUpdateAction(supabase, params.projectId, {
 *       tableName: 'participants',
 *       metadataColumn: 'metadata'
 *     })(request);
 *   }
 * };
 */
export function createCustomFieldUpdateAction(
	pb: PocketBase,
	projectId: string,
	config: CustomFieldUpdateConfig
) {
	return async (request: Request) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;
		const fieldName = formData.get('fieldName') as string;
		const value = formData.get('value') as string;

		if (!id || !fieldName) {
			return fail(400, { message: 'ID and field name are required' });
		}

		const metadataColumn = config.metadataColumn || 'metadata';

		try {
			// Fetch current entity to preserve existing metadata
			const entity = await pb.collection(config.tableName).getOne(id);

			// Verify project ownership if projectId is provided
			if (projectId) {
				const projectField = config.projectIdParam || 'project_id';
				if (entity[projectField] !== projectId) {
					return fail(403, { message: 'Unauthorized' });
				}
			}

			// Update the metadata with the new field value
			const metadata = entity[metadataColumn] || {};
			metadata[fieldName] = value || null;

			await pb.collection(config.tableName).update(id, {
				[metadataColumn]: metadata
			});
		} catch (error) {
			console.error('Error updating custom field:', error);
			return fail(500, { message: 'Failed to update custom field' });
		}

		return { success: true };
	};
}
