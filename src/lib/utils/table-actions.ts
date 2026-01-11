import { invalidateAll } from '$app/navigation';

/**
 * Creates a reusable update handler for table column inline editing
 *
 * @param action - The form action name (e.g., 'updateField')
 * @param fieldName - Optional fixed field name. If not provided, must be passed in the call
 * @returns Async function that handles the update
 *
 * @example
 * // Fixed field name
 * const updateName = createFieldUpdateHandler('updateField', 'name');
 * await updateName('row-id-123', 'New Name');
 *
 * @example
 * // Dynamic field name
 * const updateField = createFieldUpdateHandler('updateField');
 * await updateField('row-id-123', 'New Value', 'email');
 */
export function createFieldUpdateHandler(action: string, fieldName?: string) {
	return async (rowId: string, value: string, dynamicFieldName?: string) => {
		const formData = new FormData();
		formData.append('id', rowId);
		formData.append('field', dynamicFieldName || fieldName || '');
		formData.append('value', value);

		const response = await fetch(`?/${action}`, {
			method: 'POST',
			body: formData
		});

		const result = await response.json();
		if (result.type === 'success') {
			await invalidateAll();
		} else {
			throw new Error(result.data?.message || 'Update failed');
		}
	};
}

/**
 * Creates a reusable update handler for custom fields stored in metadata/JSON columns
 *
 * @param action - The form action name (e.g., 'updateCustomField')
 * @returns Async function that handles the custom field update
 *
 * @example
 * const updateCustomField = createCustomFieldUpdateHandler('updateCustomField');
 * await updateCustomField('row-id-123', 'field-value', 'custom_field_name');
 */
export function createCustomFieldUpdateHandler(action: string) {
	return async (rowId: string, value: string, fieldName: string) => {
		const formData = new FormData();
		formData.append('id', rowId);
		formData.append('fieldName', fieldName);
		formData.append('value', value);

		const response = await fetch(`?/${action}`, {
			method: 'POST',
			body: formData
		});

		const result = await response.json();
		if (result.type === 'success') {
			await invalidateAll();
		} else {
			throw new Error(result.data?.message || 'Update failed');
		}
	};
}

/**
 * Creates a reusable update handler for array fields (like roles, tags)
 *
 * @param action - The form action name (e.g., 'updateRoles')
 * @param paramName - The parameter name for the array (e.g., 'roleIds', 'participantIds')
 * @param idFieldName - The parameter name for the row ID (default: 'id')
 * @returns Async function that handles the array update
 *
 * @example
 * const updateRoles = createArrayFieldUpdateHandler('updateRoles', 'roleIds', 'participantId');
 * await updateRoles('participant-123', ['role-1', 'role-2']);
 */
export function createArrayFieldUpdateHandler(
	action: string,
	paramName: string,
	idFieldName: string = 'id'
) {
	return async (rowId: string, values: string[]) => {
		const formData = new FormData();
		formData.append(idFieldName, rowId);
		formData.append(paramName, JSON.stringify(values));

		const response = await fetch(`?/${action}`, {
			method: 'POST',
			body: formData
		});

		const result = await response.json();
		if (result.type === 'success') {
			await invalidateAll();
		} else {
			throw new Error(result.data?.message || 'Update failed');
		}
	};
}

/**
 * Creates a reusable toggle handler for boolean fields
 *
 * @param action - The form action name (e.g., 'toggleStatus')
 * @param fieldName - Optional field name to send with the toggle
 * @returns Async function that handles the toggle
 *
 * @example
 * const toggleActive = createToggleHandler('toggleStatus', 'is_active');
 * await toggleActive('row-id-123', true);
 */
export function createToggleHandler(action: string, fieldName?: string) {
	return async (rowId: string, value: boolean) => {
		const formData = new FormData();
		formData.append('id', rowId);
		if (fieldName) {
			formData.append(fieldName, String(value));
		}

		const response = await fetch(`?/${action}`, {
			method: 'POST',
			body: formData
		});

		if (response.ok) {
			await invalidateAll();
		} else {
			throw new Error('Toggle failed');
		}
	};
}
