import type { LayoutServerLoad } from './$types';

/**
 * Streams sidebar entities for a project so pages inside the project can
 * render immediately while the sidebar fills in. Consumers in +layout.svelte
 * await these promises with {#await}.
 */
export const load: LayoutServerLoad = async ({ params, depends, locals: { pb } }) => {
	const { projectId } = params;
	depends('sidebar');

	const sidebarWorkflows = pb
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
		});

	const sidebarTables = pb
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
		});

	const sidebarMarkerCategories = pb
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
		});

	return {
		sidebarWorkflows,
		sidebarTables,
		sidebarMarkerCategories
	};
};
