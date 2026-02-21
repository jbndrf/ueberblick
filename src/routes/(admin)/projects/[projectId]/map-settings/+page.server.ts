import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { mapLayerSchema, projectMapDefaultsSchema } from '$lib/schemas/map-settings';
import type { MapLayer } from '$lib/types/map-layer';
import { PRESET_SOURCES, type TileSourceConfig, type WmsSourceConfig } from '$lib/types/map-layer';
import { isValidPolygon } from '$lib/utils/geo-utils';
import { createTilePackage, type TileSource } from '$lib/server/tile-packager';
import { rm } from 'fs/promises';
import path from 'path';
import type { ProjectMapDefaults } from '$lib/types/map-layer';

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

		// Fetch map layers for this project (source data is now inline)
		let mapLayers: MapLayer[] = [];
		try {
			mapLayers = await pb.collection('map_layers').getFullList<MapLayer>({
				filter: `project_id = "${projectId}" && is_active = true`,
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

		// Get map defaults from project settings or use system defaults
		const projectSettings = project.settings as { map_defaults?: ProjectMapDefaults } | null;
		const mapDefaults = projectSettings?.map_defaults || DEFAULT_MAP_SETTINGS;

		// Find base layer for view defaults
		const baseLayer = mapLayers.find((l) => l.layer_type === 'base');

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

	// Create new map layer with source fields directly
	createLayer: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const form = await superValidate(request, zod(mapLayerSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const layerType = form.data.layer_type as 'base' | 'overlay';

			// If this is marked as base layer, unset other base layers
			if (layerType === 'base') {
				const existingBase = await pb.collection('map_layers').getFullList({
					filter: `project_id = "${projectId}" && layer_type = "base"`
				});
				for (const layer of existingBase) {
					await pb.collection('map_layers').update(layer.id, { layer_type: 'overlay' });
				}
			}

			await pb.collection('map_layers').create({
				project_id: projectId,
				name: form.data.name,
				source_type: form.data.source_type,
				layer_type: layerType,
				url: form.data.url || null,
				display_order: form.data.display_order,
				visible_to_roles: form.data.visible_to_roles,
				is_active: form.data.is_active,
				config: form.data.config
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error creating map layer:', err);
			return fail(500, { form, message: 'Failed to create map layer' });
		}
	},

	// Add preset layer
	addPreset: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const presetId = formData.get('preset_id') as string;
		const layerType = (formData.get('layer_type') as string) || 'base';

		if (!presetId) {
			return fail(400, { message: 'Preset ID is required' });
		}

		const preset = PRESET_SOURCES.find((p) => p.id === presetId);
		if (!preset) {
			return fail(400, { message: 'Invalid preset' });
		}

		try {
			// If adding as base, unset existing base layers
			if (layerType === 'base') {
				const existingBase = await pb.collection('map_layers').getFullList({
					filter: `project_id = "${projectId}" && layer_type = "base"`
				});
				for (const layer of existingBase) {
					await pb.collection('map_layers').update(layer.id, { layer_type: 'overlay' });
				}
			}

			if (preset.sourceType === 'wms') {
				const config: WmsSourceConfig = {
					attribution: preset.attribution,
					layers: preset.wmsLayers || '',
					format: preset.wmsFormat || 'image/png',
					transparent: preset.wmsTransparent ?? true,
					version: preset.wmsVersion || '1.1.1'
				};

				await pb.collection('map_layers').create({
					project_id: projectId,
					name: preset.name,
					source_type: 'wms',
					layer_type: layerType,
					url: preset.url,
					config,
					is_active: true
				});
			} else {
				const config: TileSourceConfig = {
					attribution: preset.attribution,
					detected_min_zoom: preset.minZoom,
					detected_max_zoom: preset.maxZoom
				};

				await pb.collection('map_layers').create({
					project_id: projectId,
					name: preset.name,
					source_type: 'preset',
					layer_type: layerType,
					url: preset.url,
					config,
					is_active: true
				});
			}

			return { success: true };
		} catch (err) {
			console.error('Error adding preset layer:', err);
			return fail(500, { message: 'Failed to add preset' });
		}
	},

	// Add tile URL layer
	addTile: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const name = formData.get('name') as string;
		const url = formData.get('url') as string;
		const attribution = formData.get('attribution') as string;
		const layerType = (formData.get('layer_type') as string) || 'overlay';

		if (!name?.trim()) {
			return fail(400, { message: 'Name is required' });
		}
		if (!url?.trim()) {
			return fail(400, { message: 'URL is required' });
		}

		try {
			const config: TileSourceConfig = {};
			if (attribution?.trim()) {
				config.attribution = attribution.trim();
			}

			await pb.collection('map_layers').create({
				project_id: projectId,
				name: name.trim(),
				source_type: 'tile',
				layer_type: layerType,
				url: url.trim(),
				config,
				is_active: true
			});

			return { success: true };
		} catch (err) {
			console.error('Error adding tile layer:', err);
			return fail(500, { message: 'Failed to add tile layer' });
		}
	},

	// Add WMS layer
	addWms: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const name = formData.get('name') as string;
		const url = formData.get('url') as string;
		const layers = formData.get('layers') as string;
		const attribution = formData.get('attribution') as string;
		const format = formData.get('format') as string;
		const transparent = formData.get('transparent') === 'true';
		const version = formData.get('version') as string;
		const layerType = (formData.get('layer_type') as string) || 'overlay';

		if (!name?.trim()) return fail(400, { message: 'Name is required' });
		if (!url?.trim()) return fail(400, { message: 'URL is required' });
		if (!layers?.trim()) return fail(400, { message: 'WMS layers parameter is required' });

		try {
			const config: WmsSourceConfig = { layers: layers.trim() };
			if (attribution?.trim()) config.attribution = attribution.trim();
			if (format?.trim()) config.format = format.trim();
			if (transparent) config.transparent = true;
			if (version?.trim()) config.version = version.trim();

			await pb.collection('map_layers').create({
				project_id: projectId,
				name: name.trim(),
				source_type: 'wms',
				layer_type: layerType,
				url: url.trim(),
				config,
				is_active: true
			});

			return { success: true };
		} catch (err) {
			console.error('Error adding WMS layer:', err);
			return fail(500, { message: 'Failed to add WMS layer' });
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
			const layerType = form.data.layer_type as 'base' | 'overlay';

			// If this is marked as base layer, unset other base layers
			if (layerType === 'base') {
				const existingBase = await pb.collection('map_layers').getFullList({
					filter: `project_id = "${projectId}" && layer_type = "base" && id != "${id}"`
				});
				for (const layer of existingBase) {
					await pb.collection('map_layers').update(layer.id, { layer_type: 'overlay' });
				}
			}

			await pb.collection('map_layers').update(id, {
				name: form.data.name,
				source_type: form.data.source_type,
				layer_type: layerType,
				url: form.data.url || null,
				display_order: form.data.display_order,
				visible_to_roles: form.data.visible_to_roles,
				is_active: form.data.is_active,
				config: form.data.config
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error updating map layer:', err);
			return fail(500, { form, message: 'Failed to update map layer' });
		}
	},

	// Delete map layer (soft delete via is_active, or hard delete for uploaded)
	deleteLayer: async ({ request, locals: { pb } }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { message: 'Layer ID is required' });
		}

		try {
			const layer = await pb.collection('map_layers').getOne<MapLayer>(id);

			// For uploaded layers, clean up tile files
			if (layer.source_type === 'uploaded') {
				const tilesDir = path.join(process.cwd(), 'static', 'tiles', id);
				try {
					await rm(tilesDir, { recursive: true, force: true });
				} catch {
					// Continue even if files don't exist
				}
			}

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
				filter: `project_id = "${projectId}" && layer_type = "base"`
			});
			for (const layer of existingBase) {
				await pb.collection('map_layers').update(layer.id, { layer_type: 'overlay' });
			}

			// Set new base layer
			await pb.collection('map_layers').update(id, { layer_type: 'base' });
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

		// Fetch layer details (source data is now inline)
		try {
			const layerRecords = await pb.collection('map_layers').getFullList<MapLayer>({
				filter: layerIds.map(id => `id = "${id}"`).join(' || ')
			});

			console.log(`[createPackage] Found ${layerRecords.length} layers`);

			// Build tile sources from layers (source fields are now directly on the layer)
			const tileSources: TileSource[] = [];
			const httpSourceTypes = ['tile', 'preset'];
			for (const layer of layerRecords) {
				console.log(`[createPackage] Layer "${layer.name}": source_type=${layer.source_type}, url=${layer.url}`);

				// Handle uploaded layers (read from filesystem)
				if (layer.source_type === 'uploaded' && layer.status === 'completed') {
					const layerConfig = layer.config as { tile_format?: string } | null;
					tileSources.push({
						id: layer.id,
						name: layer.name,
						urlTemplate: '',
						isUploaded: true,
						layerId: layer.id,
						tileFormat: layerConfig?.tile_format || 'png'
					});
				}
				// Handle HTTP tile sources (tile, preset)
				else if (httpSourceTypes.includes(layer.source_type) && layer.url) {
					tileSources.push({
						id: layer.id,
						name: layer.name,
						urlTemplate: layer.url
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
