import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { mapLayerSchema, projectMapDefaultsSchema } from '$lib/schemas/map-settings';
import type { MapLayer, MapLayerWithSource, ProjectMapDefaults } from '$lib/types/map-layer';
import type { MapSource } from '$lib/types/map-sources';
import { isValidPolygon } from '$lib/utils/geo-utils';
import { createTilePackage, type TileSource } from '$lib/server/tile-packager';

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

		// Fetch offline packages for this project
		let offlinePackages: Array<{
			id: string;
			name: string;
			project_id: string;
			region_geojson: object;
			zoom_min: number;
			zoom_max: number;
			layers: string[];
			status: 'draft' | 'processing' | 'ready' | 'failed';
			error_message?: string;
			tile_count?: number;
			file_size_bytes?: number;
			created: string;
			updated: string;
		}> = [];
		try {
			offlinePackages = await pb.collection('offline_packages').getFullList({
				filter: `project_id = "${projectId}"`,
				sort: '-created'
			});
		} catch {
			// Collection might not exist yet
		}

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
			offlinePackages,
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
	},

	// Create offline package
	createPackage: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const name = formData.get('name') as string;
		const zoomMin = formData.get('zoom_min') as string;
		const zoomMax = formData.get('zoom_max') as string;
		const regionGeojsonStr = formData.get('region_geojson') as string;
		const layersJson = formData.get('layers') as string;
		const visibleToRolesJson = formData.get('visible_to_roles') as string;

		if (!name?.trim()) {
			return fail(400, { message: 'Package name is required' });
		}

		if (!regionGeojsonStr?.trim()) {
			return fail(400, { message: 'Region GeoJSON is required' });
		}

		let regionGeojson: object;
		try {
			regionGeojson = JSON.parse(regionGeojsonStr);
			if (!isValidPolygon(regionGeojson)) {
				return fail(400, { message: 'Invalid GeoJSON polygon' });
			}
		} catch {
			return fail(400, { message: 'Invalid JSON format' });
		}

		let layerIds: string[] = [];
		try {
			layerIds = JSON.parse(layersJson);
			if (!Array.isArray(layerIds) || layerIds.length === 0) {
				return fail(400, { message: 'At least one layer must be selected' });
			}
		} catch {
			return fail(400, { message: 'Invalid layers format' });
		}

		let visibleToRoles: string[] = [];
		try {
			if (visibleToRolesJson) {
				visibleToRoles = JSON.parse(visibleToRolesJson);
				if (!Array.isArray(visibleToRoles)) visibleToRoles = [];
			}
		} catch {
			// Empty = all roles
		}

		const userId = pb.authStore.record?.id;
		const zoomMinNum = parseInt(zoomMin, 10) || 10;
		const zoomMaxNum = parseInt(zoomMax, 10) || 16;

		// Create the package record with 'processing' status
		let pkg;
		try {
			pkg = await pb.collection('offline_packages').create({
				name: name.trim(),
				project_id: projectId,
				region_geojson: regionGeojson,
				zoom_min: zoomMinNum,
				zoom_max: zoomMaxNum,
				layers: layerIds,
				visible_to_roles: visibleToRoles,
				status: 'processing',
				created_by: userId
			});
		} catch (err) {
			console.error('Error creating package record:', err);
			return fail(500, { message: 'Failed to create package' });
		}

		// Fetch layer details with their sources
		try {
			const layerRecords = await pb.collection('map_layers').getFullList<MapLayerWithSource>({
				filter: layerIds.map(id => `id = "${id}"`).join(' || '),
				expand: 'source_id'
			});

			console.log(`[createPackage] Found ${layerRecords.length} layers`);

			// Build tile sources from layers
			// Accept tile-based source types: 'tile', 'preset' (OSM etc.), 'uploaded' (user's custom tiles)
			const tileSources: TileSource[] = [];
			const httpSourceTypes = ['tile', 'preset'];
			for (const layer of layerRecords) {
				const source = layer.expand?.source_id as MapSource | undefined;
				console.log(`[createPackage] Layer "${layer.name}": source_type=${source?.source_type}, url=${source?.url}, source_id=${source?.id}`);

				if (!source) continue;

				// Handle uploaded sources (read from filesystem)
				if (source.source_type === 'uploaded' && source.status === 'completed') {
					const sourceConfig = source.config as { tile_format?: string } | null;
					tileSources.push({
						id: source.id, // Use source.id to match cached tile layer lookups
						name: layer.name,
						urlTemplate: '', // Not used for uploaded
						isUploaded: true,
						sourceId: source.id,
						tileFormat: sourceConfig?.tile_format || 'png'
					});
				}
				// Handle HTTP tile sources (tile, preset)
				else if (httpSourceTypes.includes(source.source_type) && source.url) {
					tileSources.push({
						id: source.id, // Use source.id to match cached tile layer lookups
						name: layer.name,
						urlTemplate: source.url,
						subdomains: source.config?.subdomains as string[] | undefined
					});
				}
			}

			if (tileSources.length === 0) {
				const errorMsg = layerRecords.length === 0
					? 'No layers found with the given IDs'
					: 'No tile sources found in selected layers. Only tile-based layers (tile, preset, uploaded) can be packaged.';
				await pb.collection('offline_packages').update(pkg.id, {
					status: 'failed',
					error_message: errorMsg
				});
				return fail(400, { message: errorMsg });
			}

			console.log(`[createPackage] Starting tile download for ${tileSources.length} sources...`);

			// Download tiles and create ZIP
			const result = await createTilePackage({
				packageId: pkg.id,
				regionPolygon: regionGeojson as any,
				zoomMin: zoomMinNum,
				zoomMax: zoomMaxNum,
				layers: tileSources,
				onProgress: (done, total, layer) => {
					console.log(`[createPackage] Progress: ${done}/${total} (${layer})`);
				}
			});

			console.log(`[createPackage] Package created: ${result.tileCount} tiles, ${result.fileSizeBytes} bytes`);

			// Upload the ZIP file to PocketBase
			const zipBlob = new Blob([result.zipBuffer], { type: 'application/zip' });
			const zipFile = new File([zipBlob], `${pkg.id}.zip`, { type: 'application/zip' });

			const updateFormData = new FormData();
			updateFormData.append('status', 'ready');
			updateFormData.append('tile_count', result.tileCount.toString());
			updateFormData.append('file_size_bytes', result.fileSizeBytes.toString());
			updateFormData.append('archive_file', zipFile);

			await pb.collection('offline_packages').update(pkg.id, updateFormData);

			console.log(`[createPackage] Package ${pkg.id} ready!`);

			return { success: true, packageId: pkg.id };
		} catch (err) {
			console.error('Error creating tile package:', err);

			// Update package status to failed
			try {
				await pb.collection('offline_packages').update(pkg.id, {
					status: 'failed',
					error_message: err instanceof Error ? err.message : 'Unknown error'
				});
			} catch {
				// Ignore update error
			}

			return fail(500, { message: 'Failed to create tile package' });
		}
	},

	// Delete offline package
	deletePackage: async ({ request, locals: { pb } }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { message: 'Package ID is required' });
		}

		try {
			await pb.collection('offline_packages').delete(id);
			return { success: true };
		} catch (err) {
			console.error('Error deleting package:', err);
			return fail(500, { message: 'Failed to delete package' });
		}
	},

	// Update package role visibility
	updatePackageRoles: async ({ request, locals: { pb } }) => {
		const formData = await request.formData();
		const packageId = formData.get('packageId') as string;
		const roleIdsJson = formData.get('roleIds') as string;

		if (!packageId) {
			return fail(400, { message: 'Package ID is required' });
		}

		let roleIds: string[] = [];
		try {
			roleIds = JSON.parse(roleIdsJson);
		} catch {
			return fail(400, { message: 'Invalid role IDs format' });
		}

		try {
			await pb.collection('offline_packages').update(packageId, {
				visible_to_roles: roleIds
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating package roles:', err);
			return fail(500, { message: 'Failed to update package roles' });
		}
	}
};
