import type PocketBase from 'pocketbase';
import { getZipPath, removeZip, removeSidecar, writeStatus } from './chunked-upload';
import { importProjectArchive } from './project-archive';

export async function processProjectImport(
	importId: string,
	pb: PocketBase,
	ownerId: string,
	nameOverride?: string
): Promise<void> {
	try {
		await writeStatus(importId, { status: 'processing', progress: 0, label: 'Reading archive' });

		const zipPath = getZipPath(importId);

		const result = await importProjectArchive(
			pb,
			zipPath,
			ownerId,
			nameOverride,
			async (pct, label) => {
				await writeStatus(importId, { status: 'processing', progress: pct, label });
			}
		);

		await writeStatus(importId, {
			status: 'completed',
			progress: 100,
			projectId: result.projectId,
			counts: result.counts,
			label: 'Import complete'
		});

		await removeZip(importId);
		await removeSidecar(importId);
	} catch (err) {
		console.error('Project import error:', err);
		const msg = err instanceof Error ? err.message : 'Import failed';
		await writeStatus(importId, {
			status: 'failed',
			progress: 0,
			error: msg
		});
		try {
			await removeZip(importId);
			await removeSidecar(importId);
		} catch {
			/* ignore */
		}
	}
}
