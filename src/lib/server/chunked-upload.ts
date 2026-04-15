import { mkdir, readFile, writeFile, rm, stat } from 'fs/promises';
import path from 'path';

export const CHUNK_SIZE = 10 * 1024 * 1024;

const uploadsDir = () => path.join(process.cwd(), 'data', 'uploads');

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
