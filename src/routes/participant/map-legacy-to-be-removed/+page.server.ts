import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { participant } = await parent();

	if (!participant) {
		return {
			project: null,
			mapSettings: null,
			workflows: [],
			workflowStages: [],
			workflowConnections: [],
			markers: [],
			markerCategories: [],
			roles: []
		};
	}

	try {
		// Load project details with error handling
		let project = null;
		try {
			project = await locals.pb.collection('projects').getOne(participant.project_id);
		} catch (projectError) {
			console.error('Project not found:', participant.project_id);
			return {
				project: null,
				mapSettings: null,
				workflows: [],
				workflowStages: [],
				workflowConnections: [],
				markers: [],
				markerCategories: [],
				roles: [],
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
				sort: '-created'
			})
			.catch(() => []);

		// Get workflow IDs for loading stages and connections
		const workflowIds = workflows.map((w) => w.id);

		// Load workflow stages for all active workflows
		let workflowStages: any[] = [];
		if (workflowIds.length > 0) {
			const stageFilter = workflowIds.map((id) => `workflow_id = "${id}"`).join(' || ');
			workflowStages = await locals.pb
				.collection('workflow_stages')
				.getFullList({
					filter: stageFilter,
					sort: 'stage_order'
				})
				.catch(() => []);
		}

		// Load workflow connections for all active workflows
		let workflowConnections: any[] = [];
		if (workflowIds.length > 0) {
			const connectionFilter = workflowIds.map((id) => `workflow_id = "${id}"`).join(' || ');
			workflowConnections = await locals.pb
				.collection('workflow_connections')
				.getFullList({
					filter: connectionFilter
				})
				.catch(() => []);
		}

		// Load markers visible to participant's roles
		const markers = await locals.pb
			.collection('markers')
			.getFullList({
				filter: `project_id = "${participant.project_id}"`,
				sort: '-created',
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

		// Load roles for the project
		const roles = await locals.pb
			.collection('roles')
			.getFullList({
				filter: `project_id = "${participant.project_id}"`,
				sort: 'name'
			})
			.catch(() => []);

		return {
			project,
			mapSettings,
			workflows,
			workflowStages,
			workflowConnections,
			markers,
			markerCategories,
			roles
		};
	} catch (error) {
		console.error('Error loading map data:', error);
		return {
			project: null,
			mapSettings: null,
			workflows: [],
			workflowStages: [],
			workflowConnections: [],
			markers: [],
			markerCategories: [],
			roles: [],
			error: 'Failed to load map data'
		};
	}
};
