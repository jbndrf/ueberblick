import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { MapLayer } from '$lib/types/map-layer';

export const GET: RequestHandler = async ({ params, locals: { pb, user } }) => {
	if (!user) {
		throw error(401, 'Authentication required');
	}

	const { id } = params;

	try {
		const layer = await pb.collection('map_layers').getOne<MapLayer>(id);

		return json({
			status: layer.status,
			progress: layer.progress,
			tile_count: layer.tile_count,
			error_message: layer.error_message,
			url: layer.url
		});
	} catch (err) {
		console.error('Status check error:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to get status');
	}
};
