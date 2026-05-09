import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { isInstanceOwner } from '$lib/server/is-owner';

function slugify(input: string): string {
	return input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!isInstanceOwner(locals.user)) {
		redirect(303, '/');
	}

	const pages = await locals.pb.collection('instance_legal_pages').getFullList({
		sort: 'sort_order,created',
		fields: 'id,slug,title,content,sort_order,show_in_consent_footer,updated',
		requestKey: null
	});

	let settings: {
		id: string;
		require_consent_before_login: boolean;
		consent_banner_title: string;
		consent_banner_body: string;
		consent_accept_label: string;
		consent_reject_label: string;
	} | null = null;

	try {
		const rec = await locals.pb.collection('instance_settings').getFirstListItem('', {
			fields:
				'id,require_consent_before_login,consent_banner_title,consent_banner_body,consent_accept_label,consent_reject_label',
			requestKey: null
		});
		settings = {
			id: rec.id as string,
			require_consent_before_login: !!rec.require_consent_before_login,
			consent_banner_title: (rec.consent_banner_title as string) ?? '',
			consent_banner_body: (rec.consent_banner_body as string) ?? '',
			consent_accept_label: (rec.consent_accept_label as string) ?? 'Accept',
			consent_reject_label: (rec.consent_reject_label as string) ?? 'Reject'
		};
	} catch {
		settings = null;
	}

	return {
		pages: pages.map((p) => ({
			id: p.id as string,
			slug: p.slug as string,
			title: p.title as string,
			content: (p.content as string) ?? '',
			sort_order: (p.sort_order as number) ?? 0,
			show_in_consent_footer: !!p.show_in_consent_footer,
			updated: p.updated as string
		})),
		settings
	};
};

export const actions: Actions = {
	createPage: async ({ request, locals }) => {
		if (!isInstanceOwner(locals.user)) error(403, 'Forbidden');

		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const slugInput = String(form.get('slug') ?? '').trim();
		const content = String(form.get('content') ?? '');
		const sort_order = parseInt(String(form.get('sort_order') ?? '0'), 10) || 0;
		const show_in_consent_footer = form.get('show_in_consent_footer') === 'on';

		if (!title) return fail(400, { message: 'Title is required' });

		const slug = slugify(slugInput || title);
		if (!slug) return fail(400, { message: 'Slug is required' });

		try {
			await locals.pb.collection('instance_legal_pages').create({
				slug,
				title,
				content,
				sort_order,
				show_in_consent_footer,
				updated_by: locals.user?.id
			});
		} catch (e) {
			console.error('Failed to create legal page:', e);
			return fail(500, { message: 'Create failed (slug may already exist)' });
		}

		return { success: true };
	},

	updatePage: async ({ request, locals }) => {
		if (!isInstanceOwner(locals.user)) error(403, 'Forbidden');

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const title = String(form.get('title') ?? '').trim();
		const slugInput = String(form.get('slug') ?? '').trim();
		const content = String(form.get('content') ?? '');
		const sort_order = parseInt(String(form.get('sort_order') ?? '0'), 10) || 0;
		const show_in_consent_footer = form.get('show_in_consent_footer') === 'on';

		if (!id || !title) return fail(400, { message: 'ID and title are required' });

		const slug = slugify(slugInput || title);
		if (!slug) return fail(400, { message: 'Slug is required' });

		try {
			await locals.pb.collection('instance_legal_pages').update(id, {
				slug,
				title,
				content,
				sort_order,
				show_in_consent_footer,
				updated_by: locals.user?.id
			});
		} catch (e) {
			console.error('Failed to update legal page:', e);
			return fail(500, { message: 'Update failed' });
		}

		return { success: true };
	},

	deletePage: async ({ request, locals }) => {
		if (!isInstanceOwner(locals.user)) error(403, 'Forbidden');

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'ID required' });

		try {
			await locals.pb.collection('instance_legal_pages').delete(id);
		} catch (e) {
			console.error('Failed to delete legal page:', e);
			return fail(500, { message: 'Delete failed' });
		}

		return { success: true };
	},

	updateSettings: async ({ request, locals }) => {
		if (!isInstanceOwner(locals.user)) error(403, 'Forbidden');

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const require_consent_before_login = form.get('require_consent_before_login') === 'on';
		const consent_banner_title = String(form.get('consent_banner_title') ?? '').trim();
		const consent_banner_body = String(form.get('consent_banner_body') ?? '');
		const consent_accept_label =
			String(form.get('consent_accept_label') ?? '').trim() || 'Accept';
		const consent_reject_label =
			String(form.get('consent_reject_label') ?? '').trim() || 'Reject';

		const payload = {
			require_consent_before_login,
			consent_banner_title,
			consent_banner_body,
			consent_accept_label,
			consent_reject_label,
			updated_by: locals.user?.id
		};

		try {
			if (id) {
				await locals.pb.collection('instance_settings').update(id, payload);
			} else {
				await locals.pb.collection('instance_settings').create(payload);
			}
		} catch (e) {
			console.error('Failed to update instance settings:', e);
			return fail(500, { message: 'Settings update failed' });
		}

		return { success: true };
	}
};
