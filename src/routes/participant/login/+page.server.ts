import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { participantLoginSchema } from '$lib/schemas/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// If already logged in as participant, redirect to map
	if (locals.pb.authStore.isValid && locals.pb.authStore.record?.collectionName === 'participants') {
		redirect(303, '/participant/map');
	}

	const form = await superValidate(zod(participantLoginSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await superValidate(request, zod(participantLoginSchema));

		if (!form.valid) {
			return fail(400, { form });
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
				return fail(400, {
					form,
					message: 'This account is inactive'
				});
			}

			// Check if participant has expired
			if (participant.expires_at && new Date(participant.expires_at) < new Date()) {
				locals.pb.authStore.clear();
				return fail(400, {
					form,
					message: 'Token has expired'
				});
			}

			// Update last_active
			await locals.pb.collection('participants').update(participant.id, {
				last_active: new Date().toISOString()
			});

			// Auth cookie is automatically handled by hooks.server.ts
			redirect(303, '/participant/map');
		} catch (error: any) {
			console.error('Participant login error:', error);

			// Handle invalid credentials
			if (error?.status === 400) {
				return fail(400, {
					form,
					message: 'Invalid token'
				});
			}

			return fail(500, {
				form,
				message: 'An error occurred during login. Please try again.'
			});
		}
	}
};
