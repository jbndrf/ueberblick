import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { MapSource, TileSourceConfig, WmsSourceConfig, GeoJsonSourceConfig } from '$lib/types/map-sources';
import { PRESET_SOURCES } from '$lib/types/map-sources';
import { rm } from 'fs/promises';
import path from 'path';

export const load: PageServerLoad = async ({ locals: { pb, user } }) => {
	if (!user) {
		throw error(401, 'Authentication required');
	}

	try {
		// Fetch all map sources for this user
		const mapSources = await pb.collection('map_sources').getFullList<MapSource>({
			filter: `owner_id = "${user.id}"`,
			sort: '-created'
		});

		return {
			mapSources
		};
	} catch (err) {
		console.error('Error loading map sources:', err);
		throw error(500, 'Failed to load map sources');
	}
};

export const actions: Actions = {
	// Delete map source (removes files for uploaded sources)
	delete: async ({ request, locals: { pb, user } }) => {
		if (!user) {
			return fail(401, { message: 'Authentication required' });
		}

		const formData = await request.formData();
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { message: 'Source ID is required' });
		}

		try {
			// Get source to verify ownership
			const source = await pb.collection('map_sources').getOne<MapSource>(id);

			if (source.owner_id !== user.id) {
				return fail(403, { message: 'You do not own this source' });
			}

			// Delete tile files from filesystem (for uploaded sources)
			if (source.source_type === 'uploaded') {
				const tilesDir = path.join(process.cwd(), 'static', 'tiles', id);
				try {
					await rm(tilesDir, { recursive: true, force: true });
				} catch (err) {
					console.error('Error removing tile files:', err);
					// Continue with database deletion even if files don't exist
				}
			}

			// Delete database record
			await pb.collection('map_sources').delete(id);

			return { success: true };
		} catch (err) {
			console.error('Error deleting source:', err);
			return fail(500, { message: 'Failed to delete source' });
		}
	},

	// Update source name/config
	update: async ({ request, locals: { pb, user } }) => {
		if (!user) {
			return fail(401, { message: 'Authentication required' });
		}

		const formData = await request.formData();
		const id = formData.get('id') as string;
		const name = formData.get('name') as string;
		const url = formData.get('url') as string;
		const configJson = formData.get('config') as string;

		if (!id) {
			return fail(400, { message: 'Source ID is required' });
		}

		if (!name || name.trim().length === 0) {
			return fail(400, { message: 'Name is required' });
		}

		try {
			// Verify ownership
			const source = await pb.collection('map_sources').getOne<MapSource>(id);
			if (source.owner_id !== user.id) {
				return fail(403, { message: 'You do not own this source' });
			}

			const updateData: Record<string, unknown> = {
				name: name.trim()
			};

			if (url) {
				updateData.url = url.trim();
			}

			if (configJson) {
				try {
					updateData.config = JSON.parse(configJson);
				} catch {
					return fail(400, { message: 'Invalid config JSON' });
				}
			}

			await pb.collection('map_sources').update(id, updateData);

			return { success: true };
		} catch (err) {
			console.error('Error updating source:', err);
			return fail(500, { message: 'Failed to update source' });
		}
	},

	// Add tile source (URL-based)
	addTile: async ({ request, locals: { pb, user } }) => {
		if (!user) {
			return fail(401, { message: 'Authentication required' });
		}

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const url = formData.get('url') as string;
		const attribution = formData.get('attribution') as string;

		if (!name || name.trim().length === 0) {
			return fail(400, { message: 'Name is required' });
		}

		if (!url || url.trim().length === 0) {
			return fail(400, { message: 'URL is required' });
		}

		try {
			const config: TileSourceConfig = {};
			if (attribution?.trim()) {
				config.attribution = attribution.trim();
			}

			await pb.collection('map_sources').create({
				owner_id: user.id,
				name: name.trim(),
				source_type: 'tile',
				url: url.trim(),
				config
			});

			return { success: true };
		} catch (err) {
			console.error('Error adding tile source:', err);
			return fail(500, { message: 'Failed to add source' });
		}
	},

	// Add WMS source
	addWms: async ({ request, locals: { pb, user } }) => {
		if (!user) {
			return fail(401, { message: 'Authentication required' });
		}

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const url = formData.get('url') as string;
		const layers = formData.get('layers') as string;
		const attribution = formData.get('attribution') as string;
		const format = formData.get('format') as string;
		const transparent = formData.get('transparent') === 'true';
		const version = formData.get('version') as string;

		if (!name || name.trim().length === 0) {
			return fail(400, { message: 'Name is required' });
		}

		if (!url || url.trim().length === 0) {
			return fail(400, { message: 'URL is required' });
		}

		if (!layers || layers.trim().length === 0) {
			return fail(400, { message: 'WMS layers parameter is required' });
		}

		try {
			const config: WmsSourceConfig = {
				layers: layers.trim()
			};
			if (attribution?.trim()) {
				config.attribution = attribution.trim();
			}
			if (format?.trim()) {
				config.format = format.trim();
			}
			if (transparent) {
				config.transparent = true;
			}
			if (version?.trim()) {
				config.version = version.trim();
			}

			await pb.collection('map_sources').create({
				owner_id: user.id,
				name: name.trim(),
				source_type: 'wms',
				url: url.trim(),
				config
			});

			return { success: true };
		} catch (err) {
			console.error('Error adding WMS source:', err);
			return fail(500, { message: 'Failed to add source' });
		}
	},

	// Add GeoJSON source
	addGeojson: async ({ request, locals: { pb, user } }) => {
		if (!user) {
			return fail(401, { message: 'Authentication required' });
		}

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const url = formData.get('url') as string;
		const attribution = formData.get('attribution') as string;
		const dataJson = formData.get('data') as string;

		if (!name || name.trim().length === 0) {
			return fail(400, { message: 'Name is required' });
		}

		// Must have either URL or inline data
		if ((!url || url.trim().length === 0) && (!dataJson || dataJson.trim().length === 0)) {
			return fail(400, { message: 'Either URL or GeoJSON data is required' });
		}

		try {
			const config: GeoJsonSourceConfig = {};
			if (attribution?.trim()) {
				config.attribution = attribution.trim();
			}
			if (dataJson?.trim()) {
				try {
					config.data = JSON.parse(dataJson);
				} catch {
					return fail(400, { message: 'Invalid GeoJSON data' });
				}
			}

			await pb.collection('map_sources').create({
				owner_id: user.id,
				name: name.trim(),
				source_type: 'geojson',
				url: url?.trim() || null,
				config
			});

			return { success: true };
		} catch (err) {
			console.error('Error adding GeoJSON source:', err);
			return fail(500, { message: 'Failed to add source' });
		}
	},

	// Add preset source
	addPreset: async ({ request, locals: { pb, user } }) => {
		if (!user) {
			return fail(401, { message: 'Authentication required' });
		}

		const formData = await request.formData();
		const presetId = formData.get('preset_id') as string;

		if (!presetId) {
			return fail(400, { message: 'Preset ID is required' });
		}

		const preset = PRESET_SOURCES.find((p) => p.id === presetId);
		if (!preset) {
			return fail(400, { message: 'Invalid preset' });
		}

		try {
			const config: TileSourceConfig = {
				attribution: preset.attribution
			};
			if (preset.minZoom !== undefined) {
				config.detected_min_zoom = preset.minZoom;
			}
			if (preset.maxZoom !== undefined) {
				config.detected_max_zoom = preset.maxZoom;
			}

			await pb.collection('map_sources').create({
				owner_id: user.id,
				name: preset.name,
				source_type: 'preset',
				url: preset.url,
				config
			});

			return { success: true };
		} catch (err) {
			console.error('Error adding preset source:', err);
			return fail(500, { message: 'Failed to add preset' });
		}
	}
};
