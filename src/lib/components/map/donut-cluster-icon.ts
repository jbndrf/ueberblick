/**
 * Generates SVG donut cluster icons from aggregated composition data.
 * All segments are neutral grey with white gaps between them to indicate proportions.
 */

export interface VisualKeyInfo {
	color: string;
	label: string;
}

export type VisualKeyRegistry = Map<string, VisualKeyInfo>;

const CLUSTER_COLOR = '#6b7280'; // gray-500
const SEPARATOR_COLOR = '#ffffff';
const MIN_SLICE_FRACTION = 0.05; // slices < 5% merged into "other"

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
 * Generate an SVG donut string for a cluster.
 * Solid grey ring with white separator lines indicating proportions.
 */
export function generateDonutSvg(
	counts: Record<string, number>,
	totalCount: number,
	registry: VisualKeyRegistry,
	size: number
): string {
	const slices = buildSlices(counts, totalCount);

	const cx = size / 2;
	const cy = size / 2;
	const ringWidth = 6;
	const r = cx - ringWidth / 2 - 1;
	const fillR = r - ringWidth / 2;

	const label = totalCount < 1000
		? String(totalCount)
		: totalCount < 10000
			? `${(totalCount / 1000).toFixed(1)}k`
			: `${Math.floor(totalCount / 1000)}k`;

	const fontSize = size < 46 ? 11 : 13;

	// Separator lines: drawn from center outward, then covered by the white inner fill.
	// The outer edge is clipped by the SVG viewBox. Simple and reliable.
	let separators = '';

	if (slices.length > 1) {
		let angle = -Math.PI / 2;
		for (let i = 0; i < slices.length; i++) {
			angle += slices[i].fraction * 2 * Math.PI;
			const x = cx + size * Math.cos(angle);
			const y = cy + size * Math.sin(angle);
			separators += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${SEPARATOR_COLOR}" stroke-width="2"/>`;
		}
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
	<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CLUSTER_COLOR}" stroke-width="${ringWidth}"/>
	${separators}
	<circle cx="${cx}" cy="${cy}" r="${fillR}" fill="white"/>
	<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="bold" font-family="system-ui, sans-serif" fill="#374151">${label}</text>
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
 * Build ordered slices from counts, merging small ones into "other".
 */
function buildSlices(
	counts: Record<string, number>,
	totalCount: number
): DonutSlice[] {
	const entries = Object.entries(counts)
		.map(([key, count]) => ({
			key,
			count,
			fraction: count / totalCount
		}))
		.sort((a, b) => b.count - a.count);

	const significant: DonutSlice[] = [];
	let otherCount = 0;

	for (const entry of entries) {
		if (entry.fraction < MIN_SLICE_FRACTION) {
			otherCount += entry.count;
		} else {
			significant.push(entry);
		}
	}

	if (otherCount > 0) {
		significant.push({
			key: '_other',
			count: otherCount,
			fraction: otherCount / totalCount
		});
	}

	if (significant.length === 0) {
		significant.push({
			key: '_all',
			count: totalCount,
			fraction: 1
		});
	}

	return significant;
}
