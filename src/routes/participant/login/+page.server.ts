import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { participantLoginSchema } from '$lib/schemas/auth';
import { getAdminPb } from '$lib/server/admin-auth';
import {
	checkLoginRateLimit,
	clientIpFromEvent,
	recordLoginFailure,
	recordLoginSuccess,
	retryAfterMinutes
} from '$lib/server/rate-limit';
import * as m from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { locals, url, cookies } = event;
	// If already logged in as participant, redirect to map
	if (locals.pb.authStore.isValid && locals.pb.authStore.record?.collectionName === 'participants') {
		redirect(303, '/participant/map');
	}

	// Check whether the consent gate is enabled and whether this visitor has
	// already accepted. We need this BEFORE the token auto-login so that a
	// QR-code link can't bypass the gate.
	let consentEnabled = false;
	let consented = cookies.get('consent') === 'accepted';
	type SettingsRec = {
		consent_banner_title?: string;
		consent_banner_body?: string;
		consent_accept_label?: string;
		consent_reject_label?: string;
	};
	let settingsRec: SettingsRec | null = null;

	try {
		const s = await locals.pb.collection('instance_settings').getFirstListItem('', {
			fields:
				'require_consent_before_login,consent_banner_title,consent_banner_body,consent_accept_label,consent_reject_label',
			requestKey: null
		});
		consentEnabled = !!s.require_consent_before_login;
		settingsRec = s as unknown as SettingsRec;
	} catch {
		// No settings row -- gate disabled.
	}

	const needsConsent = consentEnabled && !consented;

	// Auto-login via ?token= query parameter (e.g. from QR code link)
	const urlToken = url.searchParams.get('token');
	if (urlToken && !needsConsent) {
		const ipKey = `participant:${clientIpFromEvent(event)}`;
		const gate = checkLoginRateLimit(ipKey);
		if (gate.allowed) {
			try {
				const authData = await locals.pb.collection('participants').authWithPassword(urlToken, urlToken);
				const participant = authData.record;

				if (!participant.is_active) {
					locals.pb.authStore.clear();
					recordLoginFailure(ipKey);
				} else if (participant.expires_at && new Date(participant.expires_at) < new Date()) {
					locals.pb.authStore.clear();
					recordLoginFailure(ipKey);
				} else {
					const adminPb = await getAdminPb();
					await adminPb.collection('participants').update(participant.id, {
						last_active: new Date().toISOString()
					});
					recordLoginSuccess(ipKey);
					redirect(303, '/participant/map');
				}
			} catch (err: any) {
				// Don't record a failure for SvelteKit's redirect control-flow throws.
				if (err?.status && err?.location) throw err;
				recordLoginFailure(ipKey);
				// Invalid token -- fall through to show the login page
			}
		}
		// If rate-limited, silently fall through to the login form. The POST
		// action below surfaces the rate-limit message to the user.
	}

	const form = await superValidate(zod4(participantLoginSchema));

	// Load the footer-visible legal pages when the gate is on. Used by the
	// modal for the back-to-page view.
	let footerPages: Array<{ slug: string; title: string; content: string }> = [];
	if (consentEnabled) {
		try {
			const pages = await locals.pb.collection('instance_legal_pages').getFullList({
				filter: 'show_in_consent_footer = true',
				sort: 'sort_order,created',
				fields: 'slug,title,content',
				requestKey: null
			});
			footerPages = pages.map((p) => ({
				slug: p.slug as string,
				title: p.title as string,
				content: (p.content as string) ?? ''
			}));
		} catch {
			// Non-fatal.
		}
	}

	return {
		form,
		consent: {
			enabled: consentEnabled,
			needsConsent,
			title: (settingsRec?.consent_banner_title as string) ?? '',
			body: (settingsRec?.consent_banner_body as string) ?? '',
			acceptLabel: (settingsRec?.consent_accept_label as string) || 'Accept',
			rejectLabel: (settingsRec?.consent_reject_label as string) || 'Reject',
			footerPages
		}
	};
};

export const actions: Actions = {
	setConsent: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const decision = String(form.get('decision') ?? 'accepted');
		cookies.set('consent', decision === 'rejected' ? 'rejected' : 'accepted', {
			path: '/',
			httpOnly: false,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 365
		});
		// Preserve any ?token=... or ?redirectTo=... on the current URL so the
		// page load re-runs with consent in place -- the auto-login via token
		// will then fire normally, and QR/manual submissions get an unblocked
		// form.
		const returnTo = String(form.get('returnTo') ?? '') || url.pathname + url.search;
		redirect(303, returnTo);
	},

	login: async (event) => {
		const { request, locals, cookies } = event;
		const form = await superValidate(request, zod4(participantLoginSchema));

		// Hard server-side gate: if consent is required and not yet given,
		// refuse to process the login no matter what the client does.
		try {
			const s = await locals.pb.collection('instance_settings').getFirstListItem('', {
				fields: 'require_consent_before_login',
				requestKey: null
			});
			if (s.require_consent_before_login && cookies.get('consent') !== 'accepted') {
				return fail(403, {
					form,
					message:
						m.participantLoginConsentRequired?.() ??
						'Please accept the cookie consent to continue.'
				});
			}
		} catch {
			// Settings missing -- treat gate as disabled.
		}

		if (!form.valid) {
			return fail(400, { form });
		}

		const ipKey = `participant:${clientIpFromEvent(event)}`;
		const gate = checkLoginRateLimit(ipKey);
		if (!gate.allowed) {
			const minutes = retryAfterMinutes(gate.retryAfterSec);
			return fail(429, {
				form,
				message:
					m.participantLoginRateLimited?.({ minutes }) ??
					`Too many login attempts. Please try again in ${minutes} minute(s).`
			});
		}

		const { token } = form.data;

		try {
			// Authenticate using PocketBase's native auth
			// Token is both the identity (lookup field) and password
			const authData = await locals.pb.collection('participants').authWithPassword(token, token);

			const participant = authData.record;

			// Check if participant is active
			if (!participant.is_active) {
				locals.pb.authStore.clear();
				recordLoginFailure(ipKey);
				return fail(400, {
					form,
					message: m.participantLoginAccountInactive?.() ?? 'This account is inactive'
				});
			}

			// Check if participant has expired
			if (participant.expires_at && new Date(participant.expires_at) < new Date()) {
				locals.pb.authStore.clear();
				recordLoginFailure(ipKey);
				return fail(400, {
					form,
					message: m.participantLoginTokenExpired?.() ?? 'Token has expired'
				});
			}

			// Update last_active via admin client (participant can't update own record)
			const adminPb = await getAdminPb();
			await adminPb.collection('participants').update(participant.id, {
				last_active: new Date().toISOString()
			});

		} catch (error: any) {
			console.error('Participant login error:', error);
			recordLoginFailure(ipKey);

			if (error?.status === 400) {
				return fail(400, {
					form,
					message: m.participantLoginInvalidToken?.() ?? 'Invalid or expired token'
				});
			}

			return fail(500, {
				form,
				message: m.participantLoginError?.() ?? 'Login failed. Please check your token and try again.'
			});
		}

		recordLoginSuccess(ipKey);
		// Redirect OUTSIDE try-catch so SvelteKit can process it
		redirect(303, '/participant/map');
	}
};
