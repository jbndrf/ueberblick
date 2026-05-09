import type { LayoutServerLoad } from './$types';

/**
 * Loads sidebar entities for a project. We await all three in parallel because
 * they're tiny (~10ms total) and rendering them into the SSR HTML lets the
 * sidebar show navigable links before the page's JS bundle hydrates -- which
 * matters in dev mode where hydration of large pages takes seconds.
 */
export const load: LayoutServerLoad = async ({ params, depends, locals: { pb } }) => {
	const { projectId } = params;
	depends('app:sidebar');

	const [sidebarWorkflows, sidebarTables, sidebarMarkerCategories] = await Promise.all([
		pb
			.collection('workflows')
			.getFullList({
				filter: `project_id = "${projectId}"`,
				fields: 'id,name,workflow_type,sort_order',
				sort: 'sort_order,name',
				requestKey: null
			})
			.catch((err) => {
				console.error('Error fetching sidebar workflows:', err);
				return [] as Array<{ id: string; name: string; workflow_type: string; sort_order: number }>;
			}),
		pb
			.collection('custom_tables')
			.getFullList({
				filter: `project_id = "${projectId}"`,
				fields: 'id,display_name',
				sort: 'display_name',
				requestKey: null
			})
			.catch((err) => {
				console.error('Error fetching sidebar custom tables:', err);
				return [] as Array<{ id: string; display_name: string }>;
			}),
		pb
			.collection('marker_categories')
			.getFullList({
				filter: `project_id = "${projectId}"`,
				fields: 'id,name',
				sort: 'name',
				requestKey: null
			})
			.catch((err) => {
				console.error('Error fetching sidebar marker categories:', err);
				return [] as Array<{ id: string; name: string }>;
			})
	]);

	return {
		sidebarWorkflows,
		sidebarTables,
		sidebarMarkerCategories
	};
};
