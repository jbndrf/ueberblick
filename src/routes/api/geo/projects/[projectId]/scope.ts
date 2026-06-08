import { error } from '@sveltejs/kit';
import type PocketBase from 'pocketbase';
import type { ApiTokenRecord } from '$lib/server/api-token';

/**
 * Enforce that the request may see this project:
 *  - a project-scoped token must match the requested project;
 *  - the impersonated admin must actually be able to read the project (PB's
 *    owner_id rule). `getOne` 404s otherwise — we surface that as 404.
 */
export async function assertProjectAccess(
	pb: PocketBase,
	tokenRec: ApiTokenRecord,
	projectId: string
): Promise<void> {
	if (tokenRec.project_id && tokenRec.project_id !== projectId) {
		throw error(403, 'Token is not scoped to this project');
	}
	try {
		await pb.collection('projects').getOne(projectId, { fields: 'id', requestKey: null });
	} catch {
		throw error(404, 'Project not found');
	}
}
