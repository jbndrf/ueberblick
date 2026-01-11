/**
 * Client-side PocketBase client
 * Provides authentication and database operations for the browser
 */

import PocketBase from 'pocketbase';
import { POCKETBASE_URL } from '$lib/config/pocketbase';
import type { RecordModel } from 'pocketbase';

let pocketbaseClient: PocketBase | null = null;

export function getPocketBase(): PocketBase {
	if (!pocketbaseClient) {
		pocketbaseClient = new PocketBase(POCKETBASE_URL);

		// Load auth from cookie if available (browser only)
		// Note: This may not work if cookies are HttpOnly
		// For authenticated operations, use server-side actions instead
		if (typeof document !== 'undefined') {
			pocketbaseClient.authStore.loadFromCookie(document.cookie);
		}
	}
	return pocketbaseClient;
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string) {
	const pb = getPocketBase();
	const authData = await pb.collection('users').authWithPassword(email, password);
	return { user: authData.record };
}

/**
 * Sign out current user
 */
export function signOut() {
	const pb = getPocketBase();
	pb.authStore.clear();
}

/**
 * Get current user
 */
export function getCurrentUser(): RecordModel | null {
	const pb = getPocketBase();
	return pb.authStore.model;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
	const pb = getPocketBase();
	return pb.authStore.isValid;
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(callback: (user: RecordModel | null) => void) {
	const pb = getPocketBase();

	// Call immediately with current state
	callback(pb.authStore.model);

	// Subscribe to changes
	return pb.authStore.onChange((token, model) => {
		callback(model);
	});
}
