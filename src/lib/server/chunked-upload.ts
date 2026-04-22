import { mkdir, readFile, writeFile, rm, stat } from 'fs/promises';
import path from 'path';

export const CHUNK_SIZE = 10 * 1024 * 1024;

const uploadsDir = () => {
	if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR;
	if (process.env.DOCKER_ENV === 'true') return '/app/data/uploads';
	return path.join(process.cwd(), '.uploads');
};

export async function ensureUploadsDir(): Promise<void> {
	await mkdir(uploadsDir(), { recursive: true });
}

export function getZipPath(layerId: string): string {
	return path.join(uploadsDir(), `${layerId}.zip`);
}

export function getSidecarPath(layerId: string): string {
	return path.join(uploadsDir(), `${layerId}.chunks.json`);
}

export async function readSidecar(layerId: string): Promise<Set<number>> {
	try {
		const raw = await readFile(getSidecarPath(layerId), 'utf-8');
		const arr = JSON.parse(raw);
		return new Set(Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n)) : []);
	} catch {
		return new Set();
	}
}

export async function writeSidecar(layerId: string, received: Set<number>): Promise<void> {
	const arr = Array.from(received).sort((a, b) => a - b);
	await writeFile(getSidecarPath(layerId), JSON.stringify(arr), 'utf-8');
}

export async function removeSidecar(layerId: string): Promise<void> {
	await rm(getSidecarPath(layerId), { force: true });
}

export async function zipExists(layerId: string): Promise<boolean> {
	try {
		await stat(getZipPath(layerId));
		return true;
	} catch {
		return false;
	}
}

export type ImportStatus = {
	status: 'uploading' | 'pending' | 'processing' | 'completed' | 'failed';
	progress: number;
	label?: string;
	error?: string;
	projectId?: string;
	counts?: Record<string, number>;
	filename?: string;
	nameOverride?: string;
	total_size?: number;
	total_chunks?: number;
	chunk_size?: number;
	owner_id?: string;
	updated_at: string;
};

export function getStatusPath(id: string): string {
	return path.join(uploadsDir(), `${id}.status.json`);
}

export async function readStatus(id: string): Promise<ImportStatus | null> {
	try {
		const raw = await readFile(getStatusPath(id), 'utf-8');
		return JSON.parse(raw) as ImportStatus;
	} catch {
		return null;
	}
}

export async function writeStatus(
	id: string,
	patch: Partial<ImportStatus> & Pick<ImportStatus, 'status' | 'progress'>
): Promise<void> {
	const existing = (await readStatus(id)) ?? ({} as Partial<ImportStatus>);
	const next: ImportStatus = {
		...existing,
		...patch,
		updated_at: new Date().toISOString()
	} as ImportStatus;
	await writeFile(getStatusPath(id), JSON.stringify(next), 'utf-8');
}

export async function removeStatus(id: string): Promise<void> {
	await rm(getStatusPath(id), { force: true });
}

export async function removeZip(id: string): Promise<void> {
	await rm(getZipPath(id), { force: true });
}
