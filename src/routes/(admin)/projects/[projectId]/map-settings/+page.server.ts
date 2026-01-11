import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { mapLayerSchema, projectMapDefaultsSchema } from '$lib/schemas/map-settings';
import type { MapLayer, MapLayerWithSource, ProjectMapDefaults } from '$lib/types/map-layer';
import type { MapSource } from '$lib/types/map-sources';

// Default map view settings (used when no base layer exists)
const DEFAULT_MAP_SETTINGS: ProjectMapDefaults = {
	zoom: 10,
	center: { lat: 51.1657, lng: 10.4515 }
};

export const load: PageServerLoad = async ({ locals: { pb }, params }) => {
	const { projectId } = params;

	try {
		// Fetch project details (including settings for map_defaults fallback)
		const project = await pb.collection('projects').getOne(projectId, {
			fields: 'id, name, settings'
		});

		// Fetch map layers for this project with expanded source data
		let mapLayers: MapLayerWithSource[] = [];
		try {
			mapLayers = await pb.collection('map_layers').getFullList<MapLayerWithSource>({
				filter: `project_id = "${projectId}" && is_active = true`,
				sort: 'display_order',
				expand: 'source_id'
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

		// Fetch user's map sources (for layer source selection)
		let mapSources: MapSource[] = [];
		try {
			const userId = pb.authStore.record?.id;
			if (userId) {
				mapSources = await pb.collection('map_sources').getFullList<MapSource>({
					filter: `owner_id = "${userId}"`,
					sort: 'name'
				});
			}
		} catch {
			// Collection might not exist yet
		}

		// Get map defaults from project settings or use system defaults
		const projectSettings = project.settings as { map_defaults?: ProjectMapDefaults } | null;
		const mapDefaults = projectSettings?.map_defaults || DEFAULT_MAP_SETTINGS;

		// Find base layer for view defaults
		const baseLayer = mapLayers.find((l) => l.is_base_layer);

		// Initialize forms
		const layerForm = await superValidate(zod(mapLayerSchema));
		const defaultsForm = await superValidate(mapDefaults, zod(projectMapDefaultsSchema));

		return {
			project,
			mapLayers,
			mapSources,
			roles,
			mapDefaults,
			baseLayer,
			layerForm,
			defaultsForm
		};
	} catch (err) {
		console.error('Error loading map settings:', err);
		throw error(500, 'Failed to load map settings');
	}
};

export const actions: Actions = {
	// Save project map defaults (fallback when no base layer)
	saveDefaults: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const form = await superValidate(request, zod(projectMapDefaultsSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			// Get current project settings
			const project = await pb.collection('projects').getOne(projectId);
			const currentSettings = (project.settings as Record<string, unknown>) || {};

			// Update with new map defaults
			await pb.collection('projects').update(projectId, {
				settings: {
					...currentSettings,
					map_defaults: form.data
				}
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error saving map defaults:', err);
			return fail(500, { form, message: 'Failed to save map defaults' });
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
				source_id: form.data.source_id,
				name: form.data.name,
				display_order: form.data.display_order,
				visible_to_roles: form.data.visible_to_roles,
				is_base_layer: form.data.is_base_layer,
				is_active: form.data.is_active,
				config: form.data.config
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
				source_id: form.data.source_id,
				name: form.data.name,
				display_order: form.data.display_order,
				visible_to_roles: form.data.visible_to_roles,
				is_base_layer: form.data.is_base_layer,
				is_active: form.data.is_active,
				config: form.data.config
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
	},

	// Update base layer view defaults
	updateBaseLayerDefaults: async ({ request, locals: { pb } }) => {
		const formData = await request.formData();
		const layerId = formData.get('layerId') as string;
		const defaultZoom = formData.get('default_zoom');
		const centerLat = formData.get('center_lat');
		const centerLng = formData.get('center_lng');

		if (!layerId) {
			return fail(400, { message: 'Layer ID is required' });
		}

		try {
			// Get current layer config
			const layer = await pb.collection('map_layers').getOne<MapLayer>(layerId);
			const currentConfig = layer.config || {};

			// Update config with view defaults
			const newConfig = {
				...currentConfig,
				default_zoom: defaultZoom ? Number(defaultZoom) : undefined,
				default_center:
					centerLat && centerLng
						? { lat: Number(centerLat), lng: Number(centerLng) }
						: undefined
			};

			await pb.collection('map_layers').update(layerId, { config: newConfig });
			return { success: true };
		} catch (err) {
			console.error('Error updating base layer defaults:', err);
			return fail(500, { message: 'Failed to update base layer defaults' });
		}
	}
};
