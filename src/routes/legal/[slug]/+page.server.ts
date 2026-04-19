import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const slug = params.slug;
	if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
		error(404, 'Page not found');
	}

	try {
		const record = await locals.pb
			.collection('instance_legal_pages')
			.getFirstListItem(`slug = "${slug}"`, {
				fields: 'id,slug,title,content,updated',
				requestKey: null
			});
		return {
			page: {
				slug: record.slug as string,
				title: record.title as string,
				content: (record.content as string) ?? '',
				updated: record.updated as string
			}
		};
	} catch {
		error(404, 'Page not found');
	}
};
