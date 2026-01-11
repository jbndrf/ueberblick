import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { MapSource } from '$lib/types/map-sources';

export const GET: RequestHandler = async ({ params, locals: { pb, user } }) => {
	if (!user) {
		throw error(401, 'Authentication required');
	}

	const { id } = params;

	try {
		const source = await pb.collection('map_sources').getOne<MapSource>(id);

		// Verify ownership
		if (source.owner_id !== user.id) {
			throw error(403, 'Access denied');
		}

		return json({
			status: source.status,
			progress: source.progress,
			tile_count: source.tile_count,
			error_message: source.error_message,
			url: source.url
		});
	} catch (err) {
		console.error('Status check error:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to get status');
	}
};
