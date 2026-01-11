import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { mapSettingsSchema, mapLayerSchema } from '$lib/schemas/map-settings';
import type { MapSettings, MapLayer } from '$lib/types/map-layer';

// Default view settings
const DEFAULT_CONFIG = {
	default_zoom: 10,
	min_zoom: 1,
	max_zoom: 18,
	center_lat: 51.1657,
	center_lng: 10.4515
};

export const load: PageServerLoad = async ({ locals: { pb }, params }) => {
	const { projectId } = params;

	try {
		// Fetch project details
		const project = await pb.collection('projects').getOne(projectId, {
			fields: 'id, name'
		});

		// Fetch the single map settings for this project (or null if none)
		let mapSettings: MapSettings | null = null;
		try {
			const results = await pb.collection('map_settings').getFullList<MapSettings>({
				filter: `project_id = "${projectId}"`,
				limit: 1
			});
			mapSettings = results[0] || null;
		} catch {
			// Collection might not exist yet
		}

		// Fetch map layers for this project
		let mapLayers: MapLayer[] = [];
		try {
			mapLayers = await pb.collection('map_layers').getFullList<MapLayer>({
				filter: `project_id = "${projectId}"`,
				sort: 'display_order'
			});
		} catch {
			// Collection might not exist yet
		}

		// Fetch roles for this project (for layer visibility)
		const roles = await pb.collection('roles').getFullList({
			filter: `project_id = "${projectId}"`,
			fields: 'id, name, description',
			sort: 'name'
		});

		// Initialize form with existing config or defaults
		const initialData = mapSettings?.config || DEFAULT_CONFIG;
		const settingsForm = await superValidate(initialData, zod(mapSettingsSchema));
		const layerForm = await superValidate(zod(mapLayerSchema));

		return {
			project,
			mapSettings,
			mapLayers,
			roles,
			settingsForm,
			layerForm
		};
	} catch (err) {
		console.error('Error loading map settings:', err);
		throw error(500, 'Failed to load map settings');
	}
};

export const actions: Actions = {
	// Save map view settings (create or update)
	saveSettings: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const form = await superValidate(request, zod(mapSettingsSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			// Check if settings exist for this project
			const existing = await pb.collection('map_settings').getFullList({
				filter: `project_id = "${projectId}"`,
				limit: 1
			});

			if (existing.length > 0) {
				// Update existing
				await pb.collection('map_settings').update(existing[0].id, {
					config: form.data
				});
			} else {
				// Create new
				await pb.collection('map_settings').create({
					project_id: projectId,
					config: form.data
				});
			}

			return { form, success: true };
		} catch (err) {
			console.error('Error saving map settings:', err);
			return fail(500, { form, message: 'Failed to save map settings' });
		}
	},

	// Create new map layer
	createLayer: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const form = await superValidate(request, zod(mapLayerSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			// If this is marked as base layer, unset other base layers
			if (form.data.is_base_layer) {
				const existingBase = await pb.collection('map_layers').getFullList({
					filter: `project_id = "${projectId}" && is_base_layer = true`
				});
				for (const layer of existingBase) {
					await pb.collection('map_layers').update(layer.id, { is_base_layer: false });
				}
			}

			await pb.collection('map_layers').create({
				project_id: projectId,
				name: form.data.name,
				layer_type: form.data.layer_type,
				url: form.data.url,
				config: form.data.config,
				display_order: form.data.display_order,
				visible_to_roles: form.data.visible_to_roles,
				is_base_layer: form.data.is_base_layer,
				is_active: form.data.is_active
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error creating map layer:', err);
			return fail(500, { form, message: 'Failed to create map layer' });
		}
	},

	// Update map layer
	updateLayer: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { message: 'Layer ID is required' });
		}

		const form = await superValidate(formData, zod(mapLayerSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			// If this is marked as base layer, unset other base layers
			if (form.data.is_base_layer) {
				const existingBase = await pb.collection('map_layers').getFullList({
					filter: `project_id = "${projectId}" && is_base_layer = true && id != "${id}"`
				});
				for (const layer of existingBase) {
					await pb.collection('map_layers').update(layer.id, { is_base_layer: false });
				}
			}

			await pb.collection('map_layers').update(id, {
				name: form.data.name,
				layer_type: form.data.layer_type,
				url: form.data.url,
				config: form.data.config,
				display_order: form.data.display_order,
				visible_to_roles: form.data.visible_to_roles,
				is_base_layer: form.data.is_base_layer,
				is_active: form.data.is_active
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error updating map layer:', err);
			return fail(500, { form, message: 'Failed to update map layer' });
		}
	},

	// Delete map layer (soft delete)
	deleteLayer: async ({ request, locals: { pb } }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { message: 'Layer ID is required' });
		}

		try {
			await pb.collection('map_layers').update(id, { is_active: false });
			return { success: true };
		} catch (err) {
			console.error('Error deleting layer:', err);
			return fail(500, { message: 'Failed to delete layer' });
		}
	},

	// Set layer as base layer
	setBaseLayer: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { message: 'Layer ID is required' });
		}

		try {
			// Unset all base layers for this project
			const existingBase = await pb.collection('map_layers').getFullList({
				filter: `project_id = "${projectId}" && is_base_layer = true`
			});
			for (const layer of existingBase) {
				await pb.collection('map_layers').update(layer.id, { is_base_layer: false });
			}

			// Set new base layer
			await pb.collection('map_layers').update(id, { is_base_layer: true });
			return { success: true };
		} catch (err) {
			console.error('Error setting base layer:', err);
			return fail(500, { message: 'Failed to set base layer' });
		}
	},

	// Update layer role visibility
	updateLayerRoles: async ({ request, locals: { pb } }) => {
		const formData = await request.formData();
		const layerId = formData.get('layerId') as string;
		const roleIdsJson = formData.get('roleIds') as string;

		if (!layerId) {
			return fail(400, { message: 'Layer ID is required' });
		}

		let roleIds: string[] = [];
		try {
			roleIds = JSON.parse(roleIdsJson);
		} catch {
			return fail(400, { message: 'Invalid role IDs format' });
		}

		try {
			await pb.collection('map_layers').update(layerId, {
				visible_to_roles: roleIds
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating layer roles:', err);
			return fail(500, { message: 'Failed to update layer roles' });
		}
	}
};
