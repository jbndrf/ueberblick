/**
 * Server-side authentication utilities
 * Handles PocketBase SSR authentication for SvelteKit
 */

import PocketBase from 'pocketbase';
import type { Handle } from '@sveltejs/kit';
import { POCKETBASE_URL } from '$lib/config/pocketbase';
import type { RecordModel } from 'pocketbase';

/**
 * Create a PocketBase instance for server-side requests
 */
export function createPocketBaseServer(event: Parameters<Handle>[0]['event']): PocketBase {
	const pb = new PocketBase(POCKETBASE_URL);

	// Load auth store from cookie
	pb.authStore.loadFromCookie(event.request.headers.get('cookie') || '');

	return pb;
}

/**
 * Get the current authenticated user
 */
export function getUser(pb: PocketBase): RecordModel | null {
	return pb.authStore.model;
}

/**
 * Check if user is authenticated
 */
export function requireAuth(pb: PocketBase): RecordModel {
	const user = getUser(pb);
	if (!user) {
		throw new Error('Authentication required');
	}
	return user;
}
