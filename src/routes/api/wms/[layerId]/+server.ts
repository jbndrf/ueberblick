import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { MapLayer } from '$lib/types/map-layer';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile, rename } from 'fs/promises';
import path from 'path';
import { createHash, randomBytes } from 'crypto';

/**
 * WMS proxy endpoint.
 *
 * Forwards GetMap requests from the participant browser to the upstream WMS
 * configured on the layer. Caches responses on disk keyed by a hash of the
 * normalized query string so user IPs never reach the upstream and repeated
 * pans/zooms are served locally.
 *
 * Only a fixed allow-list of query params is forwarded; cookies and headers
 * from the incoming request are dropped.
 */

const CACHE_DIR = path.join(process.cwd(), 'data', 'wms-cache');

// Permission cache (mirrors /api/tiles).
interface PermEntry {
	expiresAt: number;
	upstreamUrl: string | null;
	defaultLayers: string;
	defaultFormat: string;
	defaultVersion: string;
	defaultTransparent: boolean;
}
const permCache = new Map<string, PermEntry>();
const PERM_TTL_MS = 60_000;
const PERM_CACHE_MAX = 10_000;

function getCachedPerm(userId: string, layerId: string): PermEntry | null {
	const entry = permCache.get(`${userId}:${layerId}`);
	if (!entry) return null;
	if (entry.expiresAt <= Date.now()) {
		permCache.delete(`${userId}:${layerId}`);
		return null;
	}
	return entry;
}
function setCachedPerm(userId: string, layerId: string, entry: Omit<PermEntry, 'expiresAt'>): void {
	if (permCache.size >= PERM_CACHE_MAX) {
		const firstKey = permCache.keys().next().value;
		if (firstKey) permCache.delete(firstKey);
	}
	permCache.set(`${userId}:${layerId}`, { ...entry, expiresAt: Date.now() + PERM_TTL_MS });
}

// Only forward params that belong to a WMS GetMap request. Anything else
// (cookies, auth, debug params, etc.) is dropped before going upstream.
const ALLOWED_PARAMS = new Set([
	'service',
	'request',
	'version',
	'layers',
	'styles',
	'format',
	'transparent',
	'bbox',
	'width',
	'height',
	'srs',
	'crs',
	'bgcolor',
	'exceptions',
	'time',
	'elevation',
	'sld',
	'sld_body',
	'tiled'
]);

const FALLBACK_USER_AGENT = process.env.TILE_PROXY_USER_AGENT || 'Ueberblick-TileProxy/1.0';

function buildUserAgent(origin: string | null | undefined): string {
	if (origin) return `Ueberblick/1.0 (+${origin})`;
	return FALLBACK_USER_AGENT;
}

function extFromContentType(ct: string | null | undefined): string {
	if (!ct) return 'bin';
	const c = ct.toLowerCase();
	if (c.includes('png')) return 'png';
	if (c.includes('jpeg') || c.includes('jpg')) return 'jpg';
	if (c.includes('webp')) return 'webp';
	if (c.includes('gif')) return 'gif';
	if (c.includes('xml')) return 'xml';
	return 'bin';
}

function buildUpstreamQuery(
	incoming: URLSearchParams,
	defaults: { layers: string; format: string; version: string; transparent: boolean }
): URLSearchParams {
	const out = new URLSearchParams();
	const seen = new Set<string>();

	for (const [rawKey, value] of incoming) {
		const key = rawKey.toLowerCase();
		if (!ALLOWED_PARAMS.has(key)) continue;
		if (seen.has(key)) continue; // dedupe; first wins
		seen.add(key);
		out.set(key, value);
	}

	// Required defaults if the client didn't send them.
	if (!seen.has('service')) out.set('service', 'WMS');
	if (!seen.has('request')) out.set('request', 'GetMap');
	if (!seen.has('version')) out.set('version', defaults.version);
	if (!seen.has('layers')) out.set('layers', defaults.layers);
	if (!seen.has('format')) out.set('format', defaults.format);
	if (!seen.has('transparent')) out.set('transparent', String(defaults.transparent));

	return out;
}

/**
 * Build a stable cache key from the normalized query: sorted keys, lowercased
 * names, BBOX rounded to 6 decimals to collapse trivially-different requests.
 */
function cacheKeyFor(query: URLSearchParams): string {
	const entries: [string, string][] = [];
	for (const [rawKey, value] of query) {
		const key = rawKey.toLowerCase();
		let v = value;
		if (key === 'bbox') {
			const parts = value.split(',').map((p) => Number.parseFloat(p));
			if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
				v = parts.map((n) => n.toFixed(6)).join(',');
			}
		}
		entries.push([key, v]);
	}
	entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
	const canonical = entries.map(([k, v]) => `${k}=${v}`).join('&');
	return createHash('sha1').update(canonical).digest('hex');
}

async function tryReadCache(layerId: string, key: string): Promise<{ data: Uint8Array; ext: string } | null> {
	const dir = path.join(CACHE_DIR, layerId);
	for (const ext of ['png', 'jpg', 'webp', 'gif', 'xml', 'bin']) {
		const p = path.join(dir, `${key}.${ext}`);
		if (existsSync(p)) {
			try {
				const buf = await readFile(p);
				return { data: new Uint8Array(buf), ext };
			} catch {
				return null;
			}
		}
	}
	return null;
}

async function writeCacheAtomic(layerId: string, key: string, ext: string, data: Uint8Array): Promise<void> {
	const dir = path.join(CACHE_DIR, layerId);
	await mkdir(dir, { recursive: true });
	const final = path.join(dir, `${key}.${ext}`);
	const tmp = `${final}.${randomBytes(6).toString('hex')}.tmp`;
	await writeFile(tmp, data);
	try {
		await rename(tmp, final);
	} catch (err) {
		try {
			const { unlink } = await import('fs/promises');
			await unlink(tmp);
		} catch {
			// ignore
		}
		throw err;
	}
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	xml: 'application/xml',
	bin: 'application/octet-stream'
};

export const GET: RequestHandler = async ({ params, locals, request, url }) => {
	const { layerId } = params;

	if (!locals.pb.authStore.isValid || !locals.user) {
		throw error(401, 'Authentication required');
	}

	let perm = getCachedPerm(locals.user.id, layerId);
	if (!perm) {
		try {
			const layer = await locals.pb.collection('map_layers').getOne<MapLayer>(layerId);
			if (layer.source_type !== 'wms') {
				throw error(400, 'Layer is not a WMS source');
			}
			const cfg = layer.config ?? {};
			perm = {
				expiresAt: 0,
				upstreamUrl: layer.url,
				defaultLayers: cfg.layers || '',
				defaultFormat: cfg.format || 'image/png',
				defaultVersion: cfg.version || '1.1.1',
				defaultTransparent: cfg.transparent ?? true
			};
			setCachedPerm(locals.user.id, layerId, perm);
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err) {
				const pbError = err as { status: number };
				if (pbError.status === 404) throw error(404, 'Layer not found');
				if (pbError.status === 403) throw error(403, 'Access denied');
			}
			throw err;
		}
	}

	if (!perm.upstreamUrl) {
		throw error(400, 'Layer has no upstream URL configured');
	}

	const upstreamQuery = buildUpstreamQuery(url.searchParams, {
		layers: perm.defaultLayers,
		format: perm.defaultFormat,
		version: perm.defaultVersion,
		transparent: perm.defaultTransparent
	});

	const key = cacheKeyFor(upstreamQuery);

	const cached = await tryReadCache(layerId, key);
	if (cached) {
		const ab = new ArrayBuffer(cached.data.byteLength);
		new Uint8Array(ab).set(cached.data);
		return new Response(ab, {
			headers: {
				'Content-Type': CONTENT_TYPE_BY_EXT[cached.ext] || 'application/octet-stream',
				'Content-Length': String(cached.data.byteLength),
				'Cache-Control': 'public, max-age=86400',
				'X-Tile-Cache': 'HIT'
			}
		});
	}

	// Forward to upstream. Build URL preserving any query already on the
	// configured base (e.g. capability tokens) but our params win.
	const upstreamBase = new URL(perm.upstreamUrl);
	for (const [k, v] of upstreamQuery) {
		upstreamBase.searchParams.set(k, v);
	}

	let res: Response;
	try {
		res = await fetch(upstreamBase.toString(), {
			signal: request.signal,
			headers: { 'User-Agent': buildUserAgent(url.origin), Accept: 'image/*,application/xml' }
		});
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') throw err;
		console.warn(`[wms-proxy] upstream fetch failed: ${upstreamBase}`, err);
		throw error(502, 'Upstream WMS unavailable');
	}

	if (!res.ok) {
		console.warn(`[wms-proxy] upstream non-OK ${res.status}: ${upstreamBase}`);
		throw error(res.status === 404 ? 404 : 502, 'Upstream WMS error');
	}

	const buf = new Uint8Array(await res.arrayBuffer());
	const contentType = res.headers.get('content-type') || 'application/octet-stream';
	const ext = extFromContentType(contentType);

	// Don't cache error documents the upstream may have returned with 200.
	if (ext !== 'xml') {
		try {
			await writeCacheAtomic(layerId, key, ext, buf);
		} catch (err) {
			console.warn(`[wms-proxy] failed to write cache for ${layerId}/${key}.${ext}`, err);
		}
	}

	const ab = new ArrayBuffer(buf.byteLength);
	new Uint8Array(ab).set(buf);
	return new Response(ab, {
		headers: {
			'Content-Type': contentType,
			'Content-Length': String(buf.byteLength),
			'Cache-Control': 'public, max-age=86400',
			'X-Tile-Cache': 'MISS'
		}
	});
};
