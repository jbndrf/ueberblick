import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const records = await locals.pb.collection('instance_legal_pages').getFullList({
		sort: 'sort_order,created',
		fields: 'id,slug,title',
		requestKey: null
	});
	return {
		pages: records.map((r) => ({
			slug: r.slug as string,
			title: r.title as string
		}))
	};
};
