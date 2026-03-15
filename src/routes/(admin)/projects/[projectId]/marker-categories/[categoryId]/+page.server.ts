import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import { normalizeRecords } from '$lib/server/pocketbase-helpers';

const fieldSchema = z.object({
	field_name: z
		.string()
		.min(1, 'Field name is required')
		.regex(
			/^[a-z][a-z0-9_]*$/,
			'Field name must start with a letter and contain only lowercase letters, numbers, and underscores'
		),
	field_type: z.enum(['text', 'number', 'date', 'boolean'], {
		required_error: 'Field type is required'
	}),
	is_required: z.boolean().optional(),
	default_value: z.string().optional().nullable()
});

export const load: PageServerLoad = async ({ params, locals: { pb } }) => {
	const { projectId, categoryId } = params;

	try {
		// Fetch the marker category
		const category = await pb.collection('marker_categories').getOne(categoryId, {
			filter: `project_id = "${projectId}"`
		});

		if (!category) {
			throw error(404, 'Category not found');
		}

		// Parse fields from JSONB array
		const fields = Array.isArray(category.fields) ? category.fields : [];

		// Fetch markers and roles in parallel
		const [markersRaw, roles] = await Promise.all([
			pb.collection('markers').getFullList({
				filter: `category_id = "${categoryId}"`,
				sort: '-created'
			}),
			pb.collection('roles').getFullList({
				filter: `project_id = "${projectId}"`,
				fields: 'id,name',
				sort: 'name'
			})
		]);

		// Normalize markers to parse JSON array fields from TEXT columns
		const markers = normalizeRecords(markersRaw, 'markers');

		return {
			category,
			fields,
			markers: markers || [],
			roles: roles || []
		};
	} catch (err) {
		console.error('Error fetching marker category:', err);
		throw error(500, 'Failed to load marker category');
	}
};

export const actions: Actions = {
	updateCategoryMeta: async ({ request, params, locals: { pb } }) => {
		const { categoryId } = params;
		const formData = await request.formData();
		const field = formData.get('field') as string;
		const value = formData.get('value') as string;

		if (!field) {
			return fail(400, { message: 'Field name is required' });
		}

		const allowedFields = ['name', 'description', 'visible_to_roles'];
		if (!allowedFields.includes(field)) {
			return fail(400, { message: 'Invalid field' });
		}

		try {
			let parsedValue: any = value;
			if (field === 'visible_to_roles') {
				parsedValue = value ? JSON.parse(value) : [];
			}
			await pb.collection('marker_categories').update(categoryId, {
				[field]: parsedValue
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating category metadata:', err);
			return fail(500, { message: 'Failed to update category' });
		}
	},

	updateIconConfig: async ({ request, params, locals: { pb } }) => {
		const { categoryId } = params;
		const formData = await request.formData();
		const iconConfigJson = formData.get('iconConfig') as string;

		let iconConfig;
		try {
			iconConfig = iconConfigJson ? JSON.parse(iconConfigJson) : {};
		} catch {
			return fail(400, { message: 'Invalid icon config JSON' });
		}

		try {
			await pb.collection('marker_categories').update(categoryId, {
				icon_config: iconConfig
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating icon config:', err);
			return fail(500, { message: 'Failed to update icon config' });
		}
	},

	createField: async ({ request, params, locals: { pb } }) => {
		const { categoryId } = params;
		const formData = await request.formData();

		const fieldData = {
			field_name: (formData.get('fieldName') as string)?.trim(),
			field_type: formData.get('fieldType') as string,
			is_required: formData.get('isRequired') === 'true',
			default_value: (formData.get('defaultValue') as string)?.trim() || null
		};

		// Validate with Zod
		const validationResult = fieldSchema.safeParse(fieldData);
		if (!validationResult.success) {
			return fail(400, {
				message: validationResult.error.errors[0]?.message || 'Invalid field data'
			});
		}

		try {
			// Get current category fields
			const category = await pb.collection('marker_categories').getOne(categoryId);
			const currentFields = Array.isArray(category?.fields) ? category.fields : [];

			// Check if field name already exists
			if (currentFields.some((field: any) => field.field_name === fieldData.field_name)) {
				return fail(400, {
					message: 'A field with that name already exists'
				});
			}

			// Add new field to fields array
			const newField = {
				id: crypto.randomUUID(),
				...fieldData
			};

			const updatedFields = [...currentFields, newField];

			await pb.collection('marker_categories').update(categoryId, { fields: updatedFields });

			return { success: true };
		} catch (err) {
			console.error('Error creating field:', err);
			return fail(500, {
				message: 'Failed to create field'
			});
		}
	},

	updateField: async ({ request, params, locals: { pb } }) => {
		const { categoryId } = params;
		const formData = await request.formData();
		const fieldId = formData.get('fieldId') as string;

		const fieldData = {
			field_name: (formData.get('fieldName') as string)?.trim(),
			field_type: formData.get('fieldType') as string,
			is_required: formData.get('isRequired') === 'true',
			default_value: (formData.get('defaultValue') as string)?.trim() || null
		};

		// Validate with Zod
		const validationResult = fieldSchema.safeParse(fieldData);
		if (!validationResult.success) {
			return fail(400, {
				message: validationResult.error.errors[0]?.message || 'Invalid field data'
			});
		}

		try {
			// Get current category fields
			const category = await pb.collection('marker_categories').getOne(categoryId);
			const currentFields = Array.isArray(category?.fields) ? category.fields : [];

			// Find the field to update and get its old name
			const fieldIndex = currentFields.findIndex((field: any) => field.id === fieldId);
			if (fieldIndex === -1) {
				return fail(404, { message: 'Field not found' });
			}

			const originalName = currentFields[fieldIndex].field_name;

			// Check if new field name already exists (excluding current field)
			if (
				currentFields.some(
					(field: any) => field.field_name === fieldData.field_name && field.id !== fieldId
				)
			) {
				return fail(400, {
					message: 'A field with that name already exists'
				});
			}

			// Update field in fields array
			currentFields[fieldIndex] = {
				id: fieldId,
				...fieldData
			};

			await pb.collection('marker_categories').update(categoryId, { fields: currentFields });

			// If field name changed, update all markers that use this category
			if (originalName !== fieldData.field_name) {
				console.log(
					`Migrating marker data from field "${originalName}" to "${fieldData.field_name}"`
				);

				// Get all markers for this category
				const markers = await pb.collection('markers').getFullList({
					filter: `category_id = "${categoryId}"`
				});

				// Update each marker that has data for the old field name
				if (markers) {
					for (const marker of markers) {
						if (marker.properties && marker.properties[originalName] !== undefined) {
							const value = marker.properties[originalName];

							// Create updated properties with new field name
							const updatedProperties = { ...marker.properties };
							updatedProperties[fieldData.field_name] = value; // Add new field name
							delete updatedProperties[originalName]; // Remove old field name

							// Update marker in database
							await pb.collection('markers').update(marker.id, {
								properties: updatedProperties
							});
						}
					}
				}
			}

			return { success: true };
		} catch (err) {
			console.error('Error updating field:', err);
			return fail(500, {
				message: 'Failed to update field'
			});
		}
	},

	deleteField: async ({ request, params, locals: { pb } }) => {
		const { categoryId } = params;
		const formData = await request.formData();
		const fieldId = formData.get('fieldId') as string;

		if (!fieldId) {
			return fail(400, { message: 'Field ID is required' });
		}

		try {
			// Get current category fields
			const category = await pb.collection('marker_categories').getOne(categoryId);
			const currentFields = Array.isArray(category?.fields) ? category.fields : [];

			// Find the field to delete
			const fieldToDelete = currentFields.find((field: any) => field.id === fieldId);
			if (!fieldToDelete) {
				return fail(404, { message: 'Field not found' });
			}

			const fieldName = fieldToDelete.field_name;

			// Remove field from fields array
			const updatedFields = currentFields.filter((field: any) => field.id !== fieldId);

			await pb.collection('marker_categories').update(categoryId, { fields: updatedFields });

			// Remove field data from all markers that use this category
			if (fieldName) {
				const markers = await pb.collection('markers').getFullList({
					filter: `category_id = "${categoryId}"`
				});

				if (markers) {
					for (const marker of markers) {
						if (marker.properties && marker.properties[fieldName] !== undefined) {
							const updatedProperties = { ...marker.properties };
							delete updatedProperties[fieldName];

							await pb.collection('markers').update(marker.id, {
								properties: updatedProperties
							});
						}
					}
				}
			}

			return { success: true };
		} catch (err) {
			console.error('Error deleting field:', err);
			return fail(500, { message: 'Failed to delete field' });
		}
	},

	updateMarkerField: async ({ request, params, locals: { pb } }) => {
		const { categoryId } = params;
		const formData = await request.formData();
		const markerId = formData.get('marker_id') as string;
		const field = formData.get('field') as string;
		const value = formData.get('value') as string;

		if (!markerId || !field) {
			return fail(400, { message: 'Marker ID and field are required' });
		}

		// Validate allowed standard fields
		if (!['title', 'description'].includes(field)) {
			return fail(400, { message: 'Invalid field' });
		}

		if (field === 'title' && (!value || value.trim().length < 1)) {
			return fail(400, { message: 'Title is required' });
		}

		const updateData: Record<string, string | null> = {
			[field]: value || null
		};

		try {
			await pb.collection('markers').update(markerId, updateData);
			return { success: true };
		} catch (err) {
			console.error('Error updating marker field:', err);
			return fail(500, { message: 'Failed to update marker field' });
		}
	},

	updateMarkerProperty: async ({ request, params, locals: { pb } }) => {
		const { categoryId } = params;
		const formData = await request.formData();
		const markerId = formData.get('marker_id') as string;
		const propertyName = formData.get('property_name') as string;
		const value = formData.get('value') as string;

		if (!markerId || !propertyName) {
			return fail(400, { message: 'Marker ID and property name are required' });
		}

		try {
			// Get current marker data
			const currentMarker = await pb.collection('markers').getOne(markerId, {
				filter: `category_id = "${categoryId}"`
			});

			if (!currentMarker) {
				return fail(404, { message: 'Marker not found' });
			}

			// Update the specific property value
			const updatedProperties = {
				...currentMarker.properties,
				[propertyName]: value || null
			};

			// Save updated marker data
			await pb.collection('markers').update(markerId, { properties: updatedProperties });

			return { success: true };
		} catch (err) {
			console.error('Error updating marker property:', err);
			return fail(500, { message: 'Failed to update marker property' });
		}
	},

	createMarker: async ({ request, params, locals: { pb } }) => {
		const { projectId, categoryId } = params;
		const formData = await request.formData();
		const title = formData.get('title') as string;
		const description = formData.get('description') as string;
		const propertiesJson = formData.get('properties') as string;

		if (!title || title.trim().length < 1) {
			return fail(400, { message: 'Title is required' });
		}

		let properties: Record<string, any> = {};
		if (propertiesJson) {
			try {
				properties = JSON.parse(propertiesJson);
			} catch (e) {
				return fail(400, { message: 'Invalid properties format' });
			}
		}

		try {
			// Create new marker without location (can be set later via map)
			await pb.collection('markers').create({
				project_id: projectId,
				category_id: categoryId,
				title,
				description: description || null,
				location: null,
				properties: properties || {},
				visible_to_roles: []
			});

			return { success: true };
		} catch (err) {
			console.error('Error creating marker:', err);
			return fail(500, { message: 'Failed to create marker' });
		}
	},

	deleteMarker: async ({ request, params, locals: { pb } }) => {
		const { categoryId } = params;
		const formData = await request.formData();
		const markerId = formData.get('marker_id') as string;

		if (!markerId) {
			return fail(400, { message: 'Marker ID is required' });
		}

		try {
			// Delete the marker
			await pb.collection('markers').delete(markerId);
			return { success: true };
		} catch (err) {
			console.error('Error deleting marker:', err);
			return fail(500, { message: 'Failed to delete marker' });
		}
	},

	importCSV: async ({ request, params, locals: { pb } }) => {
		const { projectId, categoryId } = params;
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const replaceData = formData.get('replaceData') === 'true';

		if (!file) {
			return fail(400, { message: 'CSV file is required' });
		}

		try {
			// Read CSV file
			const csvText = await file.text();
			const lines = csvText.split('\n').filter((line) => line.trim());

			if (lines.length === 0) {
				return fail(400, { message: 'CSV file is empty' });
			}

			// Parse CSV headers
			const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
			const dataRows = lines.slice(1);

			if (dataRows.length === 0) {
				return fail(400, { message: 'No data rows found in CSV' });
			}

			// Validate headers - require latitude and longitude
			if (!headers.includes('latitude') || !headers.includes('longitude')) {
				return fail(400, {
					message: 'CSV must include "latitude" and "longitude" columns for marker location data'
				});
			}

			// Parse data rows
			const markersToImport = [];
			for (let i = 0; i < dataRows.length; i++) {
				const values = dataRows[i].split(',').map((v) => v.trim().replace(/"/g, ''));
				if (values.length !== headers.length) {
					console.warn(
						`Row ${i + 2} has ${values.length} values but expected ${headers.length}. Skipping.`
					);
					continue;
				}

				const markerData: Record<string, any> = { properties: {} };
				headers.forEach((header, index) => {
					if (header === 'latitude' || header === 'longitude') {
						markerData[header] = parseFloat(values[index]) || 0;
					} else {
						markerData.properties[header] = values[index] || '';
					}
				});

				markersToImport.push({
					project_id: projectId,
					category_id: categoryId,
					title:
						markerData.properties.title ||
						markerData.properties.name ||
						`Imported Marker ${i + 1}`,
					description: markerData.properties.description || '',
					location: {
						lat: markerData.latitude,
						lon: markerData.longitude
					},
					properties: markerData.properties || {},
					visible_to_roles: []
				});
			}

			if (markersToImport.length === 0) {
				return fail(400, { message: 'No valid marker data to import' });
			}

			// Update marker category fields based on CSV headers
			const customHeaders = headers.filter((h) => h !== 'latitude' && h !== 'longitude');
			if (customHeaders.length > 0) {
				const newFields = customHeaders.map((header) => ({
					id: crypto.randomUUID(),
					field_name: header,
					field_type: 'text',
					label: header.charAt(0).toUpperCase() + header.slice(1).replace(/_/g, ' '),
					is_required: false,
					default_value: null
				}));

				// Update the marker category with new field definitions
				await pb.collection('marker_categories').update(categoryId, {
					fields: newFields
				});
			}

			// Replace existing data if requested
			if (replaceData) {
				const existingMarkers = await pb.collection('markers').getFullList({
					filter: `category_id = "${categoryId}"`
				});
				for (const marker of existingMarkers) {
					await pb.collection('markers').delete(marker.id);
				}
			}

			// Import new data
			for (const markerData of markersToImport) {
				await pb.collection('markers').create(markerData);
			}

			return {
				success: true,
				message: `Successfully imported ${markersToImport.length} markers`
			};
		} catch (err) {
			console.error('Error importing CSV:', err);
			return fail(500, {
				message: err instanceof Error ? err.message : 'Failed to import CSV'
			});
		}
	}
};
