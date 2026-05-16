import { error, redirect } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import type { RequestHandler } from './$types';
import { getAdminPb } from '$lib/server/admin-auth';
import {
	checkLoginRateLimit,
	clientIpFromEvent,
	recordLoginFailure,
	recordLoginSuccess,
	retryAfterMinutes
} from '$lib/server/rate-limit';

function generateUniqueToken(): string {
	return randomBytes(16).toString('base64url');
}

function placeholderEmail(): string {
	return `p-${randomBytes(4).toString('hex')}@placeholder.local`;
}

export const GET: RequestHandler = async (event) => {
	const { params, locals, url } = event;
	const slug = params.slug;
	if (!slug) throw error(404, 'Not found');

	const ipKey = `selfjoin:${clientIpFromEvent(event)}`;
	const gate = checkLoginRateLimit(ipKey);
	if (!gate.allowed) {
		const minutes = retryAfterMinutes(gate.retryAfterSec);
		throw error(429, `Too many join attempts. Try again in ${minutes} minute(s).`);
	}

	// Honor the same consent gate as /login: if the instance requires consent
	// and this visitor hasn't accepted yet, bounce to the login page (which
	// shows the consent modal) and come back here after acceptance.
	if (event.cookies.get('consent') !== 'accepted') {
		try {
			const s = await locals.pbParticipant.collection('instance_settings').getFirstListItem('', {
				fields: 'require_consent_before_login',
				requestKey: null
			});
			if (s.require_consent_before_login) {
				const returnTo = `/join/${encodeURIComponent(slug)}${url.search}`;
				throw redirect(303, `/login?returnTo=${encodeURIComponent(returnTo)}`);
			}
		} catch (err: any) {
			if (err?.status && err?.location) throw err;
			// Settings missing -- treat gate as disabled.
		}
	}

	const adminPb = await getAdminPb();

	let role: { id: string; project_id: string; self_joinable: boolean } | null = null;
	try {
		const rec = await adminPb.collection('roles').getFirstListItem(
			`join_slug = "${slug.replace(/"/g, '\\"')}"`,
			{ fields: 'id,project_id,self_joinable', requestKey: null }
		);
		role = {
			id: rec.id,
			project_id: rec.project_id as string,
			self_joinable: !!rec.self_joinable
		};
	} catch {
		// Not found: fall through to 404 below.
	}

	if (!role || !role.self_joinable) {
		recordLoginFailure(ipKey);
		throw error(404, 'Not found');
	}

	// Already authenticated as a participant in the same project? Just redirect.
	if (locals.participant && locals.participant.project_id === role.project_id) {
		throw redirect(303, '/map');
	}

	// Mint a new participant. Retry on token/email collisions.
	let lastErr: unknown = null;
	for (let attempt = 0; attempt < 3; attempt++) {
		const token = generateUniqueToken();
		try {
			const created = await adminPb.collection('participants').create({
				project_id: role.project_id,
				name: 'Guest',
				email: placeholderEmail(),
				emailVisibility: false,
				token,
				is_active: true,
				self_joined: true,
				role_id: [role.id],
				password: token,
				passwordConfirm: token
			});

			// Authenticate the new row on the request-scoped participant client so
			// hooks.server.ts can emit the pb_auth_participant cookie on the way out.
			await locals.pbParticipant.collection('participants').authWithPassword(token, token);

			// Best-effort last_active update.
			try {
				await adminPb.collection('participants').update(created.id, {
					last_active: new Date().toISOString()
				});
			} catch {
				/* non-fatal */
			}

			recordLoginSuccess(ipKey);
			const next = url.searchParams.get('next');
			const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/map';
			throw redirect(303, target);
		} catch (err: any) {
			// Let SvelteKit redirects bubble.
			if (err?.status && err?.location) throw err;
			lastErr = err;
			const tokenCollision = err?.data?.token?.message?.includes('unique');
			const emailCollision = err?.data?.email?.message?.includes('unique');
			if (tokenCollision || emailCollision) continue;
			break;
		}
	}

	console.error('Self-join mint failed:', lastErr);
	recordLoginFailure(ipKey);
	throw error(500, 'Could not create guest session');
};
