import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { superValidate } from 'sveltekit-superforms';
import * as m from '$lib/paraglide/messages';
import { zod4 } from 'sveltekit-superforms/adapters';
import { mapLayerSchema, projectMapDefaultsSchema } from '$lib/schemas/map-settings';
import type { MapLayer } from '$lib/types/map-layer';
import { PRESET_SOURCES, type TileSourceConfig, type WmsSourceConfig } from '$lib/types/map-layer';
import { isValidPolygon } from '$lib/utils/geo-utils';
import { createTilePackage, type TileSource } from '$lib/server/tile-packager';
import { rm } from 'fs/promises';
import path from 'path';
import type { ProjectMapDefaults } from '$lib/types/map-layer';
import { createDeleteAction } from '$lib/server/crud-actions';

// Default map view settings (used when no base layer exists)
const DEFAULT_MAP_SETTINGS: ProjectMapDefaults = {
	zoom: 10,
	center: { lat: 51.1657, lng: 10.4515 }
};

export const load: PageServerLoad = async ({ locals: { pb }, params }) => {
	const { projectId } = params;

	try {
		// Fetch project details (including settings and icon)
		const project = await pb.collection('projects').getOne(projectId, {
			fields: 'id, name, settings, icon'
		});

		// Build icon URL using relative path (works with Vite proxy and nginx)
		let iconUrl: string | null = null;
		if (project.icon) {
			iconUrl = `/api/files/projects/${project.id}/${project.icon}`;
		}

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

		// Get map defaults and display name from project settings
		const projectSettings = project.settings as { map_defaults?: ProjectMapDefaults; display_name?: string } | null;
		const mapDefaults = projectSettings?.map_defaults || DEFAULT_MAP_SETTINGS;
		const displayName = projectSettings?.display_name || '';

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

		// Fetch info pages for this project
		const infoPages = await pb.collection('info_pages').getFullList({
			filter: `project_id = "${projectId}"`,
			sort: 'sort_order,created'
		});

		// Initialize forms
		const layerForm = await superValidate(zod4(mapLayerSchema));
		const defaultsForm = await superValidate(mapDefaults, zod4(projectMapDefaultsSchema));

		return {
			project,
			iconUrl,
			displayName,
			mapLayers,
			roles,
			mapDefaults,
			baseLayer,
			offlinePackages,
			infoPages,
			layerForm,
			defaultsForm
		};
	} catch (err) {
		console.error('Error loading project settings:', err);
		throw error(500, m.settingsServerLoadError?.() ?? 'Failed to load project settings');
	}
};

export const actions: Actions = {
	// =====================================================================
	// Map Settings Actions
	// =====================================================================

	// Save project map defaults (fallback when no base layer)
	saveDefaults: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const form = await superValidate(request, zod4(projectMapDefaultsSchema));

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
			return fail(500, { form, message: m.settingsServerSaveMapDefaultsError?.() ?? 'Failed to save map defaults' });
		}
	},

	// Create new map layer with source fields directly
	createLayer: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const form = await superValidate(request, zod4(mapLayerSchema));

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
			return fail(500, { form, message: m.settingsServerCreateLayerError?.() ?? 'Failed to create map layer' });
		}
	},

	// Add preset layer
	addPreset: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const presetId = formData.get('preset_id') as string;
		const layerType = (formData.get('layer_type') as string) || 'base';

		if (!presetId) {
			return fail(400, { message: m.settingsServerPresetIdRequired?.() ?? 'Preset ID is required' });
		}

		const preset = PRESET_SOURCES.find((p) => p.id === presetId);
		if (!preset) {
			return fail(400, { message: m.settingsServerInvalidPreset?.() ?? 'Invalid preset' });
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
			return fail(500, { message: m.settingsServerAddPresetError?.() ?? 'Failed to add preset' });
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
			return fail(400, { message: m.settingsServerNameRequired?.() ?? 'Name is required' });
		}
		if (!url?.trim()) {
			return fail(400, { message: m.settingsServerUrlRequired?.() ?? 'URL is required' });
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
			return fail(500, { message: m.settingsServerAddTileLayerError?.() ?? 'Failed to add tile layer' });
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

		if (!name?.trim()) return fail(400, { message: m.settingsServerNameRequired?.() ?? 'Name is required' });
		if (!url?.trim()) return fail(400, { message: m.settingsServerUrlRequired?.() ?? 'URL is required' });
		if (!layers?.trim()) return fail(400, { message: m.settingsServerWmsLayersRequired?.() ?? 'WMS layers parameter is required' });

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
			return fail(500, { message: m.settingsServerAddWmsLayerError?.() ?? 'Failed to add WMS layer' });
		}
	},

	// Update map layer
	updateLayer: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { message: m.settingsServerLayerIdRequired?.() ?? 'Layer ID is required' });
		}

		const form = await superValidate(formData, zod4(mapLayerSchema));

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
			return fail(500, { form, message: m.settingsServerUpdateLayerError?.() ?? 'Failed to update map layer' });
		}
	},

	// Delete map layer (soft delete via is_active, or hard delete for uploaded)
	deleteLayer: async ({ request, locals: { pb } }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { message: m.settingsServerLayerIdRequired?.() ?? 'Layer ID is required' });
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
			return fail(500, { message: m.settingsServerDeleteLayerError?.() ?? 'Failed to delete layer' });
		}
	},

	// Toggle layer type between base and overlay
	toggleLayerType: async ({ request, locals: { pb } }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { message: m.settingsServerLayerIdRequired?.() ?? 'Layer ID is required' });
		}

		try {
			const layer = await pb.collection('map_layers').getOne(id);
			const newType = layer.layer_type === 'base' ? 'overlay' : 'base';
			await pb.collection('map_layers').update(id, { layer_type: newType });
			return { success: true };
		} catch (err) {
			console.error('Error toggling layer type:', err);
			return fail(500, { message: m.settingsServerToggleLayerTypeError?.() ?? 'Failed to toggle layer type' });
		}
	},

	// Update layer role visibility
	updateLayerRoles: async ({ request, locals: { pb } }) => {
		const formData = await request.formData();
		const layerId = formData.get('layerId') as string;
		const roleIdsJson = formData.get('roleIds') as string;

		if (!layerId) {
			return fail(400, { message: m.settingsServerLayerIdRequired?.() ?? 'Layer ID is required' });
		}

		let roleIds: string[] = [];
		try {
			roleIds = JSON.parse(roleIdsJson);
		} catch {
			return fail(400, { message: m.settingsServerInvalidRoleIdsFormat?.() ?? 'Invalid role IDs format' });
		}

		try {
			await pb.collection('map_layers').update(layerId, {
				visible_to_roles: roleIds
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating layer roles:', err);
			return fail(500, { message: m.settingsServerUpdateLayerRolesError?.() ?? 'Failed to update layer roles' });
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
			return fail(400, { message: m.settingsServerLayerIdRequired?.() ?? 'Layer ID is required' });
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
			return fail(500, { message: m.settingsServerUpdateBaseLayerDefaultsError?.() ?? 'Failed to update base layer defaults' });
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
			return fail(400, { message: m.settingsServerPackageNameRequired?.() ?? 'Package name is required' });
		}

		if (!regionGeojsonStr?.trim()) {
			return fail(400, { message: m.settingsServerRegionGeojsonRequired?.() ?? 'Region GeoJSON is required' });
		}

		let regionGeojson: object;
		try {
			regionGeojson = JSON.parse(regionGeojsonStr);
			if (!isValidPolygon(regionGeojson)) {
				return fail(400, { message: m.settingsServerInvalidGeojsonPolygon?.() ?? 'Invalid GeoJSON polygon' });
			}
		} catch {
			return fail(400, { message: m.settingsServerInvalidJsonFormat?.() ?? 'Invalid JSON format' });
		}

		let layerIds: string[] = [];
		try {
			layerIds = JSON.parse(layersJson);
			if (!Array.isArray(layerIds) || layerIds.length === 0) {
				return fail(400, { message: m.settingsServerAtLeastOneLayer?.() ?? 'At least one layer must be selected' });
			}
		} catch {
			return fail(400, { message: m.settingsServerInvalidLayersFormat?.() ?? 'Invalid layers format' });
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
			return fail(500, { message: m.settingsServerCreatePackageError?.() ?? 'Failed to create package' });
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
			const zipBlob = new Blob([new Uint8Array(result.zipBuffer)], { type: 'application/zip' });
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

			return fail(500, { message: m.settingsServerCreateTilePackageError?.() ?? 'Failed to create tile package' });
		}
	},

	// Delete offline package
	deletePackage: async ({ request, locals: { pb } }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { message: m.settingsServerPackageIdRequired?.() ?? 'Package ID is required' });
		}

		try {
			await pb.collection('offline_packages').delete(id);
			return { success: true };
		} catch (err) {
			console.error('Error deleting package:', err);
			return fail(500, { message: m.settingsServerDeletePackageError?.() ?? 'Failed to delete package' });
		}
	},

	// Update package role visibility
	updatePackageRoles: async ({ request, locals: { pb } }) => {
		const formData = await request.formData();
		const packageId = formData.get('packageId') as string;
		const roleIdsJson = formData.get('roleIds') as string;

		if (!packageId) {
			return fail(400, { message: m.settingsServerPackageIdRequired?.() ?? 'Package ID is required' });
		}

		let roleIds: string[] = [];
		try {
			roleIds = JSON.parse(roleIdsJson);
		} catch {
			return fail(400, { message: m.settingsServerInvalidRoleIdsFormat?.() ?? 'Invalid role IDs format' });
		}

		try {
			await pb.collection('offline_packages').update(packageId, {
				visible_to_roles: roleIds
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating package roles:', err);
			return fail(500, { message: m.settingsServerUpdatePackageRolesError?.() ?? 'Failed to update package roles' });
		}
	},

	// =====================================================================
	// General Settings Actions (Info Pages + Branding)
	// =====================================================================

	createInfoPage: async ({ request, params, locals }) => {
		const { projectId } = params;
		const pb = locals.pb;
		const formData = await request.formData();

		const title = formData.get('title') as string;
		const content = formData.get('content') as string;
		const sort_order = parseInt(formData.get('sort_order') as string) || 0;

		if (!title?.trim()) {
			return fail(400, { message: m.settingsServerTitleRequired?.() ?? 'Title is required' });
		}
		if (!content?.trim()) {
			return fail(400, { message: m.settingsServerContentRequired?.() ?? 'Content is required' });
		}

		try {
			await pb.collection('info_pages').create({
				project_id: projectId,
				title: title.trim(),
				content: content.trim(),
				sort_order
			});
		} catch (error) {
			console.error('Failed to create info page:', error);
			return fail(500, { message: m.infoPagesCreateError?.() ?? 'Failed to create info page' });
		}

		return { success: true };
	},

	updateInfoPage: async ({ request, params, locals }) => {
		const { projectId } = params;
		const pb = locals.pb;
		const formData = await request.formData();

		const id = formData.get('id') as string;
		const title = formData.get('title') as string;
		const content = formData.get('content') as string;
		const sort_order = parseInt(formData.get('sort_order') as string) || 0;

		if (!id) return fail(400, { message: m.settingsServerIdRequired?.() ?? 'ID is required' });
		if (!title?.trim()) return fail(400, { message: 'Title is required' });
		if (!content?.trim()) return fail(400, { message: m.settingsServerContentRequired?.() ?? 'Content is required' });

		try {
			const record = await pb.collection('info_pages').getOne(id);
			if (record.project_id !== projectId) {
				return fail(403, { message: m.settingsServerUnauthorized?.() ?? 'Unauthorized' });
			}

			await pb.collection('info_pages').update(id, {
				title: title.trim(),
				content: content.trim(),
				sort_order
			});
		} catch (error) {
			console.error('Failed to update info page:', error);
			return fail(500, { message: m.infoPagesUpdateError?.() ?? 'Failed to update info page' });
		}

		return { success: true };
	},

	deleteInfoPage: async ({ request, params, locals }) => {
		const { projectId } = params;
		const pb = locals.pb;
		return createDeleteAction(pb, projectId, {
			tableName: 'info_pages'
		})(request);
	},

	// Upload/update project icon
	updateAppIcon: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const iconFile = formData.get('icon') as File;

		if (!iconFile || iconFile.size === 0) {
			return fail(400, { message: m.settingsServerIconFileRequired?.() ?? 'Icon file is required' });
		}

		try {
			const uploadData = new FormData();
			uploadData.append('icon', iconFile);
			await pb.collection('projects').update(projectId, uploadData);
			return { success: true };
		} catch (err) {
			console.error('Error uploading icon:', err);
			return fail(500, { message: m.settingsServerUploadIconError?.() ?? 'Failed to upload icon' });
		}
	},

	// Remove project icon
	removeAppIcon: async ({ locals: { pb }, params }) => {
		const { projectId } = params;

		try {
			await pb.collection('projects').update(projectId, { icon: null });
			return { success: true };
		} catch (err) {
			console.error('Error removing icon:', err);
			return fail(500, { message: m.settingsServerRemoveIconError?.() ?? 'Failed to remove icon' });
		}
	},

	// Delete the project and everything that belongs to it.
	// Cascade rules handle stages, forms, instances, roles, participants,
	// custom tables, map layers, offline packages, info pages, etc.
	deleteProject: async ({ params, locals: { pb } }) => {
		const { projectId } = params;
		try {
			await pb.collection('projects').delete(projectId);
		} catch (err) {
			console.error('Error deleting project:', err);
			return fail(500, { message: m.projectsDeleteError?.() ?? 'Failed to delete project' });
		}
		throw redirect(303, '/projects');
	},

	// Update display name shown in participant app
	updateDisplayName: async ({ request, locals: { pb }, params }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const displayName = (formData.get('display_name') as string)?.trim() || '';

		try {
			const project = await pb.collection('projects').getOne(projectId);
			const currentSettings = (project.settings as Record<string, unknown>) || {};

			await pb.collection('projects').update(projectId, {
				settings: {
					...currentSettings,
					display_name: displayName || undefined
				}
			});

			return { success: true };
		} catch (err) {
			console.error('Error saving display name:', err);
			return fail(500, { message: m.settingsServerSaveDisplayNameError?.() ?? 'Failed to save display name' });
		}
	}
};
