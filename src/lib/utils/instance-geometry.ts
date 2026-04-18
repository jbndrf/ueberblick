import type { GeoPoint, GeometryBBox, InstanceGeometry } from '$lib/participant-state/types';
import pointOnFeature from '@turf/point-on-feature';

/**
 * Client-side mirror of pb/pb_hooks/workflow_instance_geometry.pb.js.
 * Used for optimistic local rendering before server save; the server hook
 * recomputes on write so the canonical values stay in lockstep.
 */

function flattenCoords(geom: InstanceGeometry): [number, number][] {
	if (!geom) return [];

	if (geom.type === 'Point') return [geom.coordinates];
	if (geom.type === 'LineString') return geom.coordinates.slice();
	if (geom.type === 'MultiLineString') {
		// Concat every sub-line's vertices into a flat list. Duplicates are
		// fine: centroid is an average and bbox is min/max, both tolerate them.
		const out: [number, number][] = [];
		for (const line of geom.coordinates) {
			for (const coord of line) out.push(coord);
		}
		return out;
	}
	if (geom.type === 'Polygon') {
		return flattenRing(geom.coordinates[0]);
	}
	if (geom.type === 'MultiPolygon') {
		const out: [number, number][] = [];
		for (const poly of geom.coordinates) {
			for (const coord of flattenRing(poly[0])) out.push(coord);
		}
		return out;
	}
	return [];
}

function flattenRing(outer: [number, number][] | undefined): [number, number][] {
	if (!outer || outer.length === 0) return [];
	const first = outer[0];
	const last = outer[outer.length - 1];
	const closed = first && last && first[0] === last[0] && first[1] === last[1];
	return closed ? outer.slice(0, -1) : outer.slice();
}

export function deriveCentroid(geom: InstanceGeometry | null): GeoPoint | null {
	if (!geom) return null;
	const coords = flattenCoords(geom);
	if (coords.length === 0) return null;
	let sumLon = 0, sumLat = 0;
	for (const [lon, lat] of coords) {
		sumLon += lon;
		sumLat += lat;
	}
	return { lon: sumLon / coords.length, lat: sumLat / coords.length };
}

export function deriveBBox(geom: InstanceGeometry | null): GeometryBBox | null {
	if (!geom) return null;
	const coords = flattenCoords(geom);
	if (coords.length === 0) return null;
	let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
	for (const [lon, lat] of coords) {
		if (lon < minLon) minLon = lon;
		if (lat < minLat) minLat = lat;
		if (lon > maxLon) maxLon = lon;
		if (lat > maxLat) maxLat = lat;
	}
	return { minLon, minLat, maxLon, maxLat };
}

export function pointGeometry(lng: number, lat: number): InstanceGeometry {
	return { type: 'Point', coordinates: [lng, lat] };
}

/**
 * Visual anchor for an instance's workflow/stage icon.
 *
 * The server-derived centroid is fine for clustering math (it's a cheap
 * representative point), but dropping an icon on a raw centroid looks off
 * for non-trivial shapes:
 *   - Concave or L-shaped polygons: arithmetic centroid can land outside
 *     the polygon or right on the edge.
 *   - Zig-zag lines: vertex-average floats in empty space next to the line.
 *
 * For rendering we compute a better anchor:
 *   - Polygon / MultiPolygon: turf.pointOnFeature -- guaranteed to sit on
 *     the polygon's surface, close to the visual center for convex shapes
 *     and always-inside for concave ones.
 *   - LineString / MultiLineString: point at half the total path length
 *     via turf.along, so the icon sits ON the stroke, not floating off it.
 *   - Point: the point itself.
 *
 * Returns {lat, lon} matching the existing centroid contract. Callers
 * should memoize per-instance-id; turf.along walks every segment so it's
 * cheap but not free at thousands of instances.
 */
export function computeIconAnchor(geom: InstanceGeometry | null): { lat: number; lon: number } | null {
	if (!geom) return null;

	if (geom.type === 'Point') {
		const [lon, lat] = geom.coordinates;
		return { lat, lon };
	}

	if (geom.type === 'LineString') {
		return alongLineMidpoint(geom.coordinates);
	}

	if (geom.type === 'MultiLineString') {
		// Pick the longest line's midpoint -- it's the most visually prominent
		// sub-line, so the icon is hardest to miss there.
		let bestLine: [number, number][] | null = null;
		let bestLen = -1;
		for (const line of geom.coordinates) {
			const len = approxPathLength(line);
			if (len > bestLen) {
				bestLen = len;
				bestLine = line;
			}
		}
		return bestLine ? alongLineMidpoint(bestLine) : null;
	}

	if (geom.type === 'Polygon') {
		return pointOnPolygon(geom.coordinates);
	}

	if (geom.type === 'MultiPolygon') {
		// Same logic as MultiLineString: put the icon on the largest sub-
		// polygon, by bbox area, so it's the most obvious target.
		let best: [number, number][][] | null = null;
		let bestArea = -1;
		for (const poly of geom.coordinates) {
			const a = approxBBoxArea(poly[0]);
			if (a > bestArea) {
				bestArea = a;
				best = poly;
			}
		}
		return best ? pointOnPolygon(best) : null;
	}

	return null;
}

// --- line helpers ---------------------------------------------------------

// Approximate path length in "lat/lon units squared" -- only used to rank
// sub-lines against each other, so absolute units don't matter.
function approxPathLength(line: [number, number][]): number {
	let total = 0;
	for (let i = 1; i < line.length; i++) {
		const dx = line[i][0] - line[i - 1][0];
		const dy = line[i][1] - line[i - 1][1];
		total += Math.sqrt(dx * dx + dy * dy);
	}
	return total;
}

function alongLineMidpoint(line: [number, number][]): { lat: number; lon: number } | null {
	if (line.length === 0) return null;
	if (line.length === 1) return { lat: line[0][1], lon: line[0][0] };

	const total = approxPathLength(line);
	const half = total / 2;

	let acc = 0;
	for (let i = 1; i < line.length; i++) {
		const [x0, y0] = line[i - 1];
		const [x1, y1] = line[i];
		const dx = x1 - x0;
		const dy = y1 - y0;
		const seg = Math.sqrt(dx * dx + dy * dy);
		if (acc + seg >= half) {
			const t = seg === 0 ? 0 : (half - acc) / seg;
			return { lat: y0 + dy * t, lon: x0 + dx * t };
		}
		acc += seg;
	}

	// Fallback: last vertex. Unreachable in practice.
	const last = line[line.length - 1];
	return { lat: last[1], lon: last[0] };
}

/**
 * Cached "best display point" for an instance. Computes iconAnchor from the
 * geometry (lazy + memoized via a WeakMap on the geometry object), and falls
 * back to the server-derived centroid when the geometry is missing or the
 * anchor can't be computed. Callers should use this for visual rendering;
 * clustering math and spatial queries stick with `instance.centroid`.
 */
const anchorCache = new WeakMap<object, { lat: number; lon: number } | null>();

export function displayAnchor(
	inst: { geometry?: InstanceGeometry | null; centroid?: { lat: number; lon: number } | null }
): { lat: number; lon: number } | null {
	if (!inst.geometry) return inst.centroid ?? null;
	const key = inst.geometry as unknown as object;
	const cached = anchorCache.get(key);
	if (cached !== undefined) return cached ?? inst.centroid ?? null;
	const computed = computeIconAnchor(inst.geometry);
	anchorCache.set(key, computed);
	return computed ?? inst.centroid ?? null;
}

// --- polygon helpers ------------------------------------------------------

function approxBBoxArea(ring: [number, number][]): number {
	if (!ring || ring.length === 0) return 0;
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const [x, y] of ring) {
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	}
	return (maxX - minX) * (maxY - minY);
}

// "Point on polygon" via turf.pointOnFeature. Falls back to arithmetic
// centroid of the outer ring if turf throws on degenerate input, so callers
// always get a usable point.
function pointOnPolygon(rings: [number, number][][]): { lat: number; lon: number } | null {
	if (!rings || rings.length === 0) return null;

	try {
		const feature = {
			type: 'Feature' as const,
			properties: {},
			geometry: { type: 'Polygon' as const, coordinates: rings }
		};
		const pt = pointOnFeature(feature);
		const [lon, lat] = pt.geometry.coordinates as [number, number];
		return { lat, lon };
	} catch {
		const outer = rings[0];
		if (!outer || outer.length === 0) return null;
		let sx = 0, sy = 0, n = 0;
		for (const [x, y] of outer) {
			sx += x;
			sy += y;
			n++;
		}
		return n === 0 ? null : { lat: sy / n, lon: sx / n };
	}
}

/**
 * Convert an instance geometry's centroid (or its point coordinates) into the
 * {lat, lon} shape used by existing marker / clustering code paths.
 */
export function geometryToLatLon(
	geom: InstanceGeometry | null,
	centroid: GeoPoint | null
): GeoPoint | null {
	if (centroid) return centroid;
	return deriveCentroid(geom);
}
