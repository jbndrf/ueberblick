/**
 * Server-side fetch-through tile cache.
 *
 * Resolves a (layerId, z, x, y) request to bytes by checking, in order:
 *   1. data/tiles/{layerId}/{z}/{x}/{y}.{ext}        (uploaded tilesets)
 *   2. data/tiles-cache/{layerId}/{z}/{x}/{y}.{ext}  (proxied/cached external)
 *   3. upstream HTTP fetch (with the layer's url template), then write to (2)
 *
 * Used by the /api/tiles endpoint so user browsers never talk to third-party
 * tile providers, and by tile-packager so offline packs warm the same cache.
 */

import { existsSync } from 'fs';
import { mkdir, readFile, writeFile, rename } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';

const UPLOADED_DIR = path.join(process.cwd(), 'data', 'tiles');
const PROXY_DIR = path.join(process.cwd(), 'data', 'tiles-cache');

const CONTENT_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp'
};

const FALLBACK_USER_AGENT = process.env.TILE_PROXY_USER_AGENT || 'Ueberblick-TileProxy/1.0';

/**
 * OSM and other tile providers' fair-use policies require a User-Agent that
 * identifies the operator with a contact (URL or email). We derive the URL
 * from the public origin the user is hitting (e.g. https://anliegen.bonn.de),
 * which is correct by definition and needs no configuration.
 */
function buildUserAgent(origin?: string | null): string {
	if (origin) return `Ueberblick/1.0 (+${origin})`;
	return FALLBACK_USER_AGENT;
}

export interface TileBytes {
	data: Uint8Array;
	contentType: string;
	format: string;
}

function extFromUrl(url: string): string | null {
	const lower = url.toLowerCase().split('?')[0];
	if (lower.endsWith('.png')) return 'png';
	if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
	if (lower.endsWith('.webp')) return 'webp';
	return null;
}

function extFromContentType(ct: string | null | undefined): string | null {
	if (!ct) return null;
	const c = ct.toLowerCase();
	if (c.includes('png')) return 'png';
	if (c.includes('jpeg') || c.includes('jpg')) return 'jpg';
	if (c.includes('webp')) return 'webp';
	return null;
}

function buildUrl(template: string, z: number, x: number, y: number, subdomains?: string[]): string {
	const subs = subdomains && subdomains.length > 0 ? subdomains : ['a', 'b', 'c'];
	const s = subs[Math.abs(x + y) % subs.length];
	return template
		.replace('{s}', s)
		.replace('{z}', String(z))
		.replace('{x}', String(x))
		.replace('{y}', String(y))
		.replace('{r}', '');
}

async function tryRead(filePath: string): Promise<Uint8Array | null> {
	if (!existsSync(filePath)) return null;
	try {
		const buf = await readFile(filePath);
		return new Uint8Array(buf);
	} catch {
		return null;
	}
}

async function findOnDisk(rootDir: string, layerId: string, z: number, x: number, y: number, preferred: string): Promise<{ data: Uint8Array; format: string } | null> {
	const tryFormats = [preferred, 'png', 'jpg', 'webp'].filter((v, i, a) => a.indexOf(v) === i);
	for (const fmt of tryFormats) {
		const p = path.join(rootDir, layerId, String(z), String(x), `${y}.${fmt}`);
		const data = await tryRead(p);
		if (data) return { data, format: fmt };
	}
	return null;
}

/**
 * Atomic write: write to a sibling temp file, then rename.
 */
async function writeAtomic(filePath: string, data: Uint8Array): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
	const tmp = `${filePath}.${randomBytes(6).toString('hex')}.tmp`;
	await writeFile(tmp, data);
	try {
		await rename(tmp, filePath);
	} catch (err) {
		// Best-effort cleanup if rename failed.
		try {
			const { unlink } = await import('fs/promises');
			await unlink(tmp);
		} catch {
			// ignore
		}
		throw err;
	}
}

export interface GetOrFetchOptions {
	layerId: string;
	z: number;
	x: number;
	y: number;
	urlTemplate: string;
	subdomains?: string[];
	/** Preferred format from layer config, used as the on-disk extension when content-type is ambiguous. */
	preferredFormat?: string;
	signal?: AbortSignal;
	/** Public origin of the incoming request, used to identify this operator
	 * to upstream providers in the User-Agent (e.g. https://app.example.de). */
	origin?: string | null;
}

/**
 * Look up a tile by checking the uploaded directory, then the proxy cache,
 * then fetching from the upstream URL template. Returns null on upstream miss
 * or non-OK response so callers can decide on fallback (e.g., parent-tile
 * synthesis on the client).
 */
export async function getOrFetchTile(opts: GetOrFetchOptions): Promise<TileBytes | null> {
	const { layerId, z, x, y, urlTemplate, subdomains, preferredFormat = 'png', signal, origin } = opts;

	const uploaded = await findOnDisk(UPLOADED_DIR, layerId, z, x, y, preferredFormat);
	if (uploaded) {
		return {
			data: uploaded.data,
			contentType: CONTENT_TYPES[uploaded.format] || 'application/octet-stream',
			format: uploaded.format
		};
	}

	const cached = await findOnDisk(PROXY_DIR, layerId, z, x, y, preferredFormat);
	if (cached) {
		return {
			data: cached.data,
			contentType: CONTENT_TYPES[cached.format] || 'application/octet-stream',
			format: cached.format
		};
	}

	if (!urlTemplate) return null;

	const url = buildUrl(urlTemplate, z, x, y, subdomains);
	let res: Response;
	try {
		res = await fetch(url, {
			signal,
			headers: { 'User-Agent': buildUserAgent(origin), Accept: 'image/*' }
		});
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') throw err;
		console.warn(`[tile-cache] upstream fetch failed: ${url}`, err);
		return null;
	}

	if (!res.ok) {
		console.warn(`[tile-cache] upstream non-OK ${res.status}: ${url}`);
		return null;
	}

	const buf = new Uint8Array(await res.arrayBuffer());
	const contentType = res.headers.get('content-type') || CONTENT_TYPES[preferredFormat] || 'application/octet-stream';
	const format =
		extFromContentType(contentType) ||
		extFromUrl(url) ||
		preferredFormat;

	const cachePath = path.join(PROXY_DIR, layerId, String(z), String(x), `${y}.${format}`);
	try {
		await writeAtomic(cachePath, buf);
	} catch (err) {
		console.warn(`[tile-cache] failed to write ${cachePath}`, err);
	}

	return { data: buf, contentType, format };
}

/**
 * Path roots exposed for callers that need to clear / inspect the cache.
 */
export const TILE_CACHE_DIRS = {
	uploaded: UPLOADED_DIR,
	proxy: PROXY_DIR
};
