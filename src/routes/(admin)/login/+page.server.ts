import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { loginSchema } from '$lib/schemas/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// If already logged in, redirect to admin dashboard
	if (locals.user) {
		redirect(303, '/admin');
	}

	const form = await superValidate(zod(loginSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals, url, cookies }) => {
		console.log('[LOGIN] Form action triggered');
		const form = await superValidate(request, zod(loginSchema));

		console.log('[LOGIN] Form data:', { email: form.data.email, valid: form.valid });

		if (!form.valid) {
			console.log('[LOGIN] Form validation failed:', form.errors);
			return fail(400, { form });
		}

		const { email, password } = form.data;

		try {
			console.log('[LOGIN] Attempting PocketBase auth for:', email);
			await locals.pb.collection('users').authWithPassword(email, password);
			console.log('[LOGIN] Auth successful, user:', email);
		} catch (error) {
			console.log('[LOGIN] Auth failed:', error);
			return fail(400, {
				form,
				message: 'Invalid email or password'
			});
		}

		// Set the auth cookie before redirecting
		const cookieValue = locals.pb.authStore.exportToCookie();
		const [cookieString] = cookieValue.split(';');
		const [, value] = cookieString.split('=');

		cookies.set('pb_auth', value, {
			path: '/',
			httpOnly: false,
			secure: false,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 7 // 1 week
		});

		console.log('[LOGIN] Cookie set, redirecting...');

		// Get redirect destination (default to admin dashboard)
		const redirectTo = url.searchParams.get('redirectTo') ?? '/admin';
		console.log('[LOGIN] Redirecting to:', redirectTo);

		redirect(303, redirectTo);
	}
};
