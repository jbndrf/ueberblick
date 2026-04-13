/**
 * Generates SVG pie-chart cluster icons from aggregated composition data.
 * Filled grey wedges with white angular gaps; largest slice starts at 12 o'clock.
 * A small white disc sits behind the count label for readability.
 */

export interface VisualKeyInfo {
	color: string;
	label: string;
}

export type VisualKeyRegistry = Map<string, VisualKeyInfo>;

const CLUSTER_COLOR = '#6b7280'; // gray-500, used for single-slice clusters
// Three shades used to distinguish adjacent slices in a multi-slice pie.
// Cycled in order; a wrap-fix swaps the last slice when needed so the
// closed ring never places two identical shades next to each other.
const SHADES = ['#4b5563', '#9ca3af', '#6b7280']; // gray-600, gray-400, gray-500
const DOMINANCE_THRESHOLD = 0.95; // slices above this render as a single solid pie

interface DonutSlice {
	key: string;
	count: number;
	fraction: number;
}

/**
 * Build a cache key from the composition counts.
 * Deterministic: sorted by key, includes size bucket.
 */
export function donutCacheKey(counts: Record<string, number>, totalCount: number): string {
	const parts = Object.keys(counts).sort().map(k => `${k}=${counts[k]}`);
	return `d_${totalCount}_${parts.join(',')}`;
}

/**
 * Generate an SVG pie-chart string for a cluster.
 * Filled wedges cycle through 3 shades of grey so adjacent slices differ.
 * Largest slice starts at 12 o'clock. Count label is black text on top.
 */
export function generateDonutSvg(
	counts: Record<string, number>,
	totalCount: number,
	_registry: VisualKeyRegistry,
	size: number
): string {
	const slices = buildSlices(counts, totalCount);

	const cx = size / 2;
	const cy = size / 2;
	const r = cx - 1; // slight inset to avoid edge clipping

	const label = totalCount < 1000
		? String(totalCount)
		: totalCount < 10000
			? `${(totalCount / 1000).toFixed(1)}k`
			: `${Math.floor(totalCount / 1000)}k`;

	const fontSize = size < 46 ? 13 : 15;

	let pieMarkup: string;

	if (slices.length <= 1) {
		pieMarkup = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${CLUSTER_COLOR}"/>`;
	} else {
		// Assign shades by cycling SHADES[i % 3]. The only case where the
		// wrap around the ring places two identical shades next to each other
		// is when slices.length % 3 === 1: slices[n-1] would inherit SHADES[0]
		// and touch slices[0] which is also SHADES[0]. In that case we force
		// the last slice to SHADES[1]. (The previous slice at index n-2 has
		// (n-2) % 3 === 2 when n % 3 === 1, so SHADES[1] is always safe.)
		const n = slices.length;
		const shadeFor = (i: number): string => {
			if (n % 3 === 1 && i === n - 1) return SHADES[1];
			return SHADES[i % 3];
		};

		let cursor = -Math.PI / 2;
		let paths = '';
		for (let i = 0; i < n; i++) {
			const sweep = slices[i].fraction * 2 * Math.PI;
			const start = cursor;
			const end = cursor + sweep;
			cursor = end;

			const x1 = (cx + r * Math.cos(start)).toFixed(2);
			const y1 = (cy + r * Math.sin(start)).toFixed(2);
			const x2 = (cx + r * Math.cos(end)).toFixed(2);
			const y2 = (cy + r * Math.sin(end)).toFixed(2);
			const largeArc = sweep > Math.PI ? 1 : 0;

			paths += `<path d="M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${shadeFor(i)}"/>`;
		}
		pieMarkup = paths;
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
	${pieMarkup}
	<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="bold" font-family="system-ui, sans-serif" fill="#000000">${label}</text>
</svg>`;
}

/**
 * Determine the icon size based on point count.
 */
export function donutSize(count: number): number {
	if (count < 10) return 40;
	if (count < 100) return 46;
	return 52;
}

/**
 * Build ordered slices from counts, sorted largest first.
 * If the dominant slice is >= DOMINANCE_THRESHOLD, collapse everything
 * into a single slice so the icon renders as a continuous ring.
 */
function buildSlices(
	counts: Record<string, number>,
	totalCount: number
): DonutSlice[] {
	if (totalCount <= 0) {
		return [{ key: '_all', count: 0, fraction: 1 }];
	}

	const entries = Object.entries(counts)
		.filter(([, count]) => count > 0)
		.map(([key, count]) => ({
			key,
			count,
			fraction: count / totalCount
		}))
		.sort((a, b) => b.count - a.count);

	if (entries.length === 0) {
		return [{ key: '_all', count: totalCount, fraction: 1 }];
	}

	if (entries[0].fraction >= DOMINANCE_THRESHOLD) {
		return [{ key: entries[0].key, count: totalCount, fraction: 1 }];
	}

	return entries;
}
