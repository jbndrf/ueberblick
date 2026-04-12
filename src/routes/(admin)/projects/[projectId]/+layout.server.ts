import type { LayoutServerLoad } from './$types';

/**
 * Loads the sidebar entities for a project so they ship with the initial HTML
 * instead of being fetched after client hydration. This removes the
 * "empty sidebar for a second or two" flash on cold navigation.
 */
export const load: LayoutServerLoad = async ({ params, depends, locals: { pb } }) => {
	const { projectId } = params;
	depends('sidebar');

	const [sidebarWorkflows, sidebarTables, sidebarMarkerCategories] = await Promise.all([
		pb.collection('workflows').getFullList({
			filter: `project_id = "${projectId}"`,
			fields: 'id,name,workflow_type',
			sort: 'name',
			requestKey: null
		}),
		pb.collection('custom_tables').getFullList({
			filter: `project_id = "${projectId}"`,
			fields: 'id,display_name',
			sort: 'display_name',
			requestKey: null
		}),
		pb.collection('marker_categories').getFullList({
			filter: `project_id = "${projectId}"`,
			fields: 'id,name',
			sort: 'name',
			requestKey: null
		})
	]);

	return {
		sidebarWorkflows,
		sidebarTables,
		sidebarMarkerCategories
	};
};
