import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import {
	createUpdateFieldAction,
	createDeleteAction,
	createCustomFieldUpdateAction
} from '$lib/server/crud-actions';
import { normalizeRecords, prepareArrayField } from '$lib/server/pocketbase-helpers';
import { getAdminPb } from '$lib/server/admin-auth';

const participantSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	email: z.string().email().optional().or(z.literal('')),
	phone: z.string().optional().or(z.literal(''))
});

/**
 * Generate a unique access token for participant
 */
function generateUniqueToken(): string {
	const timestamp = Date.now().toString(36);
	const randomPart = Math.random().toString(36).substring(2, 15);
	const additionalRandom = Math.random().toString(36).substring(2, 8);

	// Add additional entropy using crypto
	let cryptoRandom = '';
	if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
		const array = new Uint8Array(4);
		crypto.getRandomValues(array);
		cryptoRandom = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
	}

	return `${timestamp}-${randomPart}-${additionalRandom}${cryptoRandom ? '-' + cryptoRandom : ''}`;
}

export const load: PageServerLoad = async ({ params, locals: { pb } }) => {
	const { projectId } = params;

	try {
		// Use admin client to fetch participants - ensures access to token field
		// (token is an identity field which PocketBase hides from regular API requests)
		const adminPb = await getAdminPb();
		const participantsRaw = await adminPb.collection('participants').getFullList({
			filter: `project_id = "${projectId}"`,
			sort: '-created',
			fields: '*'
		});

		// Normalize participants to parse JSON array fields from TEXT columns
		const participants = normalizeRecords(participantsRaw, 'participants');

		// Fetch all roles for this project
		const roles = await pb.collection('roles').getFullList({
			filter: `project_id = "${projectId}"`
		});

		// Fetch custom field definitions for this project
		let customFields = [];
		try {
			customFields = await pb.collection('participant_custom_fields').getFullList({
				filter: `project_id = "${projectId}"`,
				sort: 'display_order'
			});
		} catch (err) {
			console.error('Error fetching custom fields:', err);
		}

		// Enhance participants with role names
		const participantsWithRoles = participants.map((participant) => {
			const roleIds = participant.role_id || [];
			const participantRoles = roleIds
				.map((roleId: string) => roles?.find((r) => r.id === roleId))
				.filter((role): role is NonNullable<typeof role> => role !== undefined);

			return {
				...participant,
				participant_roles: participantRoles
			};
		});

		const form = await superValidate(zod(participantSchema));

		return {
			participants: participantsWithRoles,
			roles: roles || [],
			customFields: customFields || [],
			form
		};
	} catch (err) {
		console.error('Error loading participants:', err);
		throw error(500, 'Failed to load participants');
	}
};

export const actions: Actions = {
	create: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const formData = await request.clone().formData();
		const roleIdsRaw = formData.get('roleIds');
		let roleIds: string[] = [];
		if (roleIdsRaw) {
			try { roleIds = JSON.parse(roleIdsRaw as string); } catch { /* ignore */ }
		}
		const form = await superValidate(request, zod(participantSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const userProvidedEmail = form.data.email;

		// Generate unique token with retry logic
		let token = generateUniqueToken();
		let retryCount = 0;
		const maxRetries = 3;

		while (retryCount < maxRetries) {
			const email =
				userProvidedEmail ||
				`p-${Math.random().toString(36).slice(2, 8)}@placeholder.local`;
			try {
				await pb.collection('participants').create({
					project_id: projectId,
					name: form.data.name,
					email: email,
					emailVisibility: true,
					phone: form.data.phone || null,
					token: token,
					is_active: true,
					password: token,
					passwordConfirm: token,
					...(roleIds.length > 0 ? { role_id: prepareArrayField(roleIds) } : {})
				});

				// Success
				return { form, success: true };
			} catch (insertError: any) {
				const tokenCollision = insertError?.data?.token?.message?.includes('unique');
				const emailCollision =
					!userProvidedEmail && insertError?.data?.email?.message?.includes('unique');
				if (tokenCollision || emailCollision) {
					retryCount++;
					if (retryCount < maxRetries) {
						token = generateUniqueToken();
						continue;
					} else {
						return fail(500, {
							form,
							message: 'Failed to generate unique token. Please try again.'
						});
					}
				}

				console.error('Error creating participant:', insertError);
				return fail(500, {
					form,
					message: 'Failed to create participant'
				});
			}
		}

		return fail(500, { form, message: 'Unexpected error' });
	},

	update: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const participantId = formData.get('id') as string;
		const roleIdsJson = formData.get('roleIds') as string;

		const form = await superValidate(formData, zod(participantSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		// Parse role IDs
		let roleIds: string[] = [];
		try {
			roleIds = JSON.parse(roleIdsJson || '[]');
		} catch (e) {
			console.error('Invalid role IDs format:', e);
		}

		try {
			await pb.collection('participants').update(participantId, {
				name: form.data.name,
				email: form.data.email || null,
				phone: form.data.phone || null,
				role_id: prepareArrayField(roleIds)
			});
		} catch (updateError) {
			console.error('Error updating participant:', updateError);
			return fail(500, {
				form,
				message: 'Failed to update participant'
			});
		}

		return { form, success: true };
	},

	delete: async ({ request, params, locals: { pb } }) => {
		return await createDeleteAction(pb, params.projectId, {
			tableName: 'participants'
		})(request);
	},

	updateRoles: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const participantId = formData.get('participantId') as string;
		const roleIdsJson = formData.get('roleIds') as string;

		if (!participantId) {
			return fail(400, { message: 'Participant ID is required' });
		}

		let roleIds: string[] = [];
		try {
			roleIds = JSON.parse(roleIdsJson || '[]');
		} catch (e) {
			return fail(400, { message: 'Invalid role IDs format' });
		}

		try {
			await pb.collection('participants').update(participantId, {
				role_id: prepareArrayField(roleIds)
			});
		} catch (updateError) {
			console.error('Error updating participant roles:', updateError);
			return fail(500, { message: 'Failed to update roles' });
		}

		return { success: true };
	},

	updateField: async ({ request, params, locals: { pb } }) => {
		return await createUpdateFieldAction(pb, params.projectId, {
			tableName: 'participants',
			allowedFields: ['name', 'email', 'phone'],
			validators: {
				name: (value) => ({
					valid: value.trim().length >= 1,
					error: 'Name is required'
				}),
				email: (value) => ({
					valid: !value || value.includes('@'),
					error: 'Invalid email format'
				})
			}
		})(request);
	},

	toggleStatus: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const participantId = formData.get('id') as string;
		const isActive = formData.get('is_active') === 'true';

		if (!participantId) {
			return fail(400, { message: 'Participant ID is required' });
		}

		try {
			await pb.collection('participants').update(participantId, {
				is_active: isActive
			});
		} catch (updateError) {
			console.error('Error toggling participant status:', updateError);
			return fail(500, { message: 'Failed to update status' });
		}

		return { success: true };
	},

	updateCustomField: async ({ request, params, locals: { pb } }) => {
		return await createCustomFieldUpdateAction(pb, params.projectId, {
			tableName: 'participants',
			metadataColumn: 'metadata'
		})(request);
	},

	createCustomField: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const fieldName = formData.get('fieldName') as string;
		const fieldType = formData.get('fieldType') as string;
		const isRequired = formData.get('isRequired') === 'true';
		const defaultValue = formData.get('defaultValue') as string;

		if (!fieldName || !fieldType) {
			return fail(400, { message: 'Field name and type are required' });
		}

		if (!['text', 'number', 'date', 'boolean'].includes(fieldType)) {
			return fail(400, { message: 'Invalid field type' });
		}

		try {
			// Get the highest display_order to append at the end
			const existingFields = await pb.collection('participant_custom_fields').getFullList({
				filter: `project_id = "${projectId}"`,
				sort: '-display_order',
				fields: 'display_order'
			});

			const nextDisplayOrder =
				existingFields && existingFields.length > 0 ? existingFields[0].display_order + 1 : 0;

			await pb.collection('participant_custom_fields').create({
				project_id: projectId,
				field_name: fieldName,
				field_type: fieldType,
				is_required: isRequired,
				default_value: defaultValue || null,
				display_order: nextDisplayOrder
			});
		} catch (insertError: any) {
			console.error('Error creating custom field:', insertError);

			// Check for duplicate field name
			if (insertError?.data?.field_name?.message?.includes('unique')) {
				return fail(400, { message: 'A field with this name already exists' });
			}

			return fail(500, { message: 'Failed to create custom field' });
		}

		return { success: true };
	},

	updateCustomFieldDefinition: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const fieldId = formData.get('fieldId') as string;
		const fieldName = formData.get('fieldName') as string;
		const fieldType = formData.get('fieldType') as string;
		const isRequired = formData.get('isRequired') === 'true';
		const defaultValue = formData.get('defaultValue') as string;

		if (!fieldId || !fieldName || !fieldType) {
			return fail(400, { message: 'Field ID, name, and type are required' });
		}

		if (!['text', 'number', 'date', 'boolean'].includes(fieldType)) {
			return fail(400, { message: 'Invalid field type' });
		}

		try {
			await pb.collection('participant_custom_fields').update(fieldId, {
				field_name: fieldName,
				field_type: fieldType,
				is_required: isRequired,
				default_value: defaultValue || null
			});
		} catch (updateError: any) {
			console.error('Error updating custom field:', updateError);

			// Check for duplicate field name
			if (updateError?.data?.field_name?.message?.includes('unique')) {
				return fail(400, { message: 'A field with this name already exists' });
			}

			return fail(500, { message: 'Failed to update custom field' });
		}

		return { success: true };
	},

	deleteCustomFieldDefinition: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const fieldId = formData.get('fieldId') as string;

		if (!fieldId) {
			return fail(400, { message: 'Field ID is required' });
		}

		try {
			await pb.collection('participant_custom_fields').delete(fieldId);
		} catch (deleteError) {
			console.error('Error deleting custom field:', deleteError);
			return fail(500, { message: 'Failed to delete custom field' });
		}

		return { success: true };
	},

	createRole: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const name = formData.get('name') as string;

		console.log('[createRole] Called with:', { projectId, name });

		if (!name) {
			console.error('[createRole] No name provided');
			return fail(400, { message: 'Role name is required' });
		}

		try {
			const newRole = await pb.collection('roles').create({
				project_id: projectId,
				name: name,
				description: ''
			});

			console.log('[createRole] Role created successfully:', newRole);
			return { success: true, entity: newRole };
		} catch (error) {
			console.error('[createRole] Error creating role:', error);
			return fail(500, { message: 'Failed to create role' });
		}
	}
};
