import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
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
	const { locals, url } = event;
	// If already logged in as participant, redirect to map
	if (locals.pb.authStore.isValid && locals.pb.authStore.record?.collectionName === 'participants') {
		redirect(303, '/participant/map');
	}

	// Auto-login via ?token= query parameter (e.g. from QR code link)
	const urlToken = url.searchParams.get('token');
	if (urlToken) {
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

	const form = await superValidate(zod(participantLoginSchema));
	return { form };
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals } = event;
		const form = await superValidate(request, zod(participantLoginSchema));

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
