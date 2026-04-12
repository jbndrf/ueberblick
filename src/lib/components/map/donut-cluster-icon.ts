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

const CLUSTER_COLOR = '#6b7280'; // gray-500
const GAP_ANGLE = 0.12; // radians between adjacent slices (~7°)
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
 * Solid grey circle with white radial separator lines marking slice boundaries.
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

	// Solid grey circle forms the pie. Since all slices are the same color,
	// we don't need separate wedge paths -- just draw radial white separator
	// lines at each slice boundary. Largest slice starts at 12 o'clock.
	let separators = '';
	if (slices.length > 1) {
		let cursor = -Math.PI / 2;
		for (let i = 0; i < slices.length; i++) {
			// Draw a separator at the START of each slice boundary.
			// Cursor begins at 12 o'clock which is also slices[0]'s start edge,
			// so we get one line per slice (n lines for n slices), which is exactly
			// the number of boundaries in a closed pie.
			const x = (cx + r * Math.cos(cursor)).toFixed(2);
			const y = (cy + r * Math.sin(cursor)).toFixed(2);
			separators += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#ffffff" stroke-width="2" stroke-linecap="butt"/>`;
			cursor += slices[i].fraction * 2 * Math.PI;
		}
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
	<circle cx="${cx}" cy="${cy}" r="${r}" fill="${CLUSTER_COLOR}"/>
	${separators}
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
