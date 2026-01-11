import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { participant } = await parent();

	if (!participant) {
		return {
			project: null,
			mapSettings: null,
			workflows: [],
			markers: []
		};
	}

	try {
		// Load project details with error handling
		let project = null;
		try {
			project = await locals.pb.collection('projects').getOne(participant.project_id);
		} catch (projectError) {
			console.error('Project not found:', participant.project_id);
			// Return empty data if project doesn't exist
			return {
				project: null,
				mapSettings: null,
				workflows: [],
				markers: [],
				markerCategories: [],
				error: 'Project not found. Please contact your administrator.'
			};
		}

		// Load map settings for the project
		const mapSettings = await locals.pb
			.collection('map_settings')
			.getFirstListItem(`project_id = "${participant.project_id}" && is_active = true`)
			.catch(() => null);

		// Load active workflows visible to participant's roles
		const workflows = await locals.pb
			.collection('workflows')
			.getFullList({
				filter: `project_id = "${participant.project_id}" && is_active = true`,
				sort: '-created_at'
			})
			.catch(() => []);

		// Load markers visible to participant's roles
		const markers = await locals.pb
			.collection('markers')
			.getFullList({
				filter: `project_id = "${participant.project_id}"`,
				sort: '-created_at',
				expand: 'category_id'
			})
			.catch(() => []);

		// Load marker categories visible to participant
		const markerCategories = await locals.pb
			.collection('marker_categories')
			.getFullList({
				filter: `project_id = "${participant.project_id}"`,
				sort: 'name'
			})
			.catch(() => []);

		return {
			project,
			mapSettings,
			workflows,
			markers,
			markerCategories
		};
	} catch (error) {
		console.error('Error loading map data:', error);
		return {
			project: null,
			mapSettings: null,
			workflows: [],
			markers: [],
			markerCategories: [],
			error: 'Failed to load map data'
		};
	}
};
