/**
 * Admin authentication utilities for Überblick
 * Handles PocketBase superuser authentication
 */

import PocketBase from 'pocketbase';
import { POCKETBASE_URL } from '$lib/config/pocketbase';
import { env } from '$env/dynamic/private';

// Cached admin PocketBase instance
let adminPbInstance: PocketBase | null = null;
let adminAuthTime = 0;
const AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Get admin credentials from environment variables
 */
export function getAdminCredentials(): { email: string; password: string } {
	return {
		email: env.POCKETBASE_ADMIN_EMAIL || '',
		password: env.POCKETBASE_ADMIN_PASSWORD || ''
	};
}

/**
 * Get an authenticated admin PocketBase instance
 * Uses cached instance if auth is still valid
 */
export async function getAdminPb(): Promise<PocketBase> {
	const now = Date.now();

	if (adminPbInstance && now - adminAuthTime < AUTH_TIMEOUT) {
		return adminPbInstance;
	}

	const pb = new PocketBase(POCKETBASE_URL);
	pb.autoCancellation(false);

	const { email, password } = getAdminCredentials();

	if (!email || !password) {
		throw new Error('Admin credentials not configured in environment variables');
	}

	await pb.collection('_superusers').authWithPassword(email, password);

	adminPbInstance = pb;
	adminAuthTime = now;
	return pb;
}
