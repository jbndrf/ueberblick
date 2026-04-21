import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { loginSchema } from '$lib/schemas/auth';
import {
	checkLoginRateLimit,
	clientIpFromEvent,
	recordLoginFailure,
	recordLoginSuccess,
	retryAfterMinutes
} from '$lib/server/rate-limit';
import type { Actions, PageServerLoad } from './$types';
import * as m from '$lib/paraglide/messages';

export const load: PageServerLoad = async ({ locals }) => {
	// If already logged in as admin user, redirect to admin dashboard
	// Only redirect for 'users' collection, not 'participants'
	if (locals.user && locals.pb.authStore.record?.collectionName === 'users') {
		redirect(303, '/admin');
	}

	const form = await superValidate(zod4(loginSchema));
	return { form };
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals, url } = event;
		console.log('[LOGIN] Form action triggered');
		const form = await superValidate(request, zod4(loginSchema));

		console.log('[LOGIN] Form data:', { email: form.data.email, valid: form.valid });

		if (!form.valid) {
			console.log('[LOGIN] Form validation failed:', form.errors);
			return fail(400, { form });
		}

		const ipKey = `admin:${clientIpFromEvent(event)}`;
		const gate = checkLoginRateLimit(ipKey);
		if (!gate.allowed) {
			const minutes = retryAfterMinutes(gate.retryAfterSec);
			return fail(429, {
				form,
				message:
					m.loginRateLimited?.({ minutes }) ??
					`Too many login attempts. Please try again in ${minutes} minute(s).`
			});
		}

		const { email, password } = form.data;

		try {
			console.log('[LOGIN] Attempting PocketBase auth for:', email);
			await locals.pb.collection('users').authWithPassword(email, password);
			console.log('[LOGIN] Auth successful, user:', email);
		} catch (error) {
			console.log('[LOGIN] Auth failed:', error);
			recordLoginFailure(ipKey);
			return fail(400, {
				form,
				message: m.loginInvalidCredentials?.() ?? 'Invalid email or password'
			});
		}

		recordLoginSuccess(ipKey);
		console.log('[LOGIN] Auth successful, redirecting...');

		// Get redirect destination (default to admin dashboard)
		const redirectTo = url.searchParams.get('redirectTo') ?? '/admin';
		console.log('[LOGIN] Redirecting to:', redirectTo);

		redirect(303, redirectTo);
	}
};
