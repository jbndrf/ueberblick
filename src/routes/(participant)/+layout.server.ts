import { redirect } from '@sveltejs/kit';
import { getAdminPb } from '$lib/server/admin-auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const isParticipantAuth =
		locals.pb.authStore.isValid &&
		locals.pb.authStore.record?.collectionName === 'participants';

	// If not logged in as participant and not on login page, redirect to login
	if (!isParticipantAuth && url.pathname !== '/participant/login') {
		redirect(303, '/participant/login');
	}

	// Return participant data from PocketBase auth
	const participant = isParticipantAuth ? locals.pb.authStore.record : null;

	// Fetch collection metadata, project settings, and info pages in parallel
	let collectionNames: string[] = [];
	let fileFields: Record<string, string[]> = {};
	let infoPages: Array<{ id: string; title: string; content: string }> = [];
	let legalPages: Array<{ id: string; slug: string; title: string; content: string }> = [];
	let projectIcon: string | null = null;
	let projectName: string | null = null;

	if (isParticipantAuth) {
		const adminPb = await getAdminPb();

		const collectionsPromise = adminPb.collections.getFullList().catch((e) => {
			console.error('Failed to get collection names:', e);
			return [] as typeof collectionNames extends (infer U)[] ? U[] : never;
		});

		const infoPagesPromise = participant?.project_id
			? adminPb.collection('info_pages').getFullList({
				filter: `project_id = "${participant.project_id}"`,
				sort: 'sort_order,created',
				fields: 'id,title,content'
			}).catch((e) => {
				console.error('Failed to load info pages:', e);
				return [] as Array<{ id: string; title: string; content: string }>;
			})
			: Promise.resolve([] as Array<{ id: string; title: string; content: string }>);

		const projectPromise = participant?.project_id
			? adminPb.collection('projects').getOne(participant.project_id, {
				fields: 'id,name,icon,settings'
			}).catch(() => null)
			: Promise.resolve(null);

		// Legal pages are instance-wide -- no project filter. Reachable from
		// the participant settings sheet so users have access to the
		// imprint/privacy/etc. without leaving the app.
		const legalPagesPromise = adminPb.collection('instance_legal_pages').getFullList({
			sort: 'sort_order,created',
			fields: 'id,slug,title,content'
		}).catch((e) => {
			console.error('Failed to load legal pages:', e);
			return [] as Array<{ id: string; slug: string; title: string; content: string }>;
		});

		const [collections, pages, project, legal] = await Promise.all([
			collectionsPromise,
			infoPagesPromise,
			projectPromise,
			legalPagesPromise
		]);

		// Process collections
		if (collections.length > 0) {
			const nonSystem = collections.filter((c: any) => !c.name.startsWith('_'));
			collectionNames = nonSystem.map((c: any) => c.name);

			for (const c of nonSystem) {
				const fileFieldNames = ((c as any).fields as Array<{ type: string; name: string }>)
					.filter((f) => f.type === 'file')
					.map((f) => f.name);
				if (fileFieldNames.length > 0) {
					fileFields[(c as any).name] = fileFieldNames;
				}
			}
		}

		// Process info pages
		infoPages = (pages as any[]).map((p) => ({ id: p.id, title: p.title, content: p.content }));

		// Process legal pages
		legalPages = (legal as any[]).map((p) => ({
			id: p.id,
			slug: p.slug,
			title: p.title,
			content: p.content ?? ''
		}));

		// Build project icon URL using relative path (works with Vite proxy and nginx)
		if (project && (project as any).icon) {
			projectIcon = `/api/files/projects/${project.id}/${(project as any).icon}`;
		}
		const settings = (project as any)?.settings as { display_name?: string } | null;
		projectName = settings?.display_name || (project as any)?.name || null;
	}

	return {
		participant,
		collectionNames,
		fileFields,
		infoPages,
		legalPages,
		projectIcon,
		projectName
	};
};
