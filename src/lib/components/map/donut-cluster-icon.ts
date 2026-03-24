/**
 * Generates SVG donut cluster icons from aggregated composition data.
 * Each slice represents a visual category (stage, filter value, marker category)
 * colored according to the VisualKeyRegistry.
 */

export interface VisualKeyInfo {
	color: string;
	label: string;
}

export type VisualKeyRegistry = Map<string, VisualKeyInfo>;

const FALLBACK_COLOR = '#9ca3af'; // gray-400
const MIN_SLICE_FRACTION = 0.05; // slices < 5% merged into "other"

interface DonutSlice {
	key: string;
	color: string;
	count: number;
	fraction: number;
}

/**
 * Build a cache key from the composition counts.
 * Deterministic: sorted by key, includes size bucket.
 */
export function donutCacheKey(counts: Record<string, number>, totalCount: number): string {
	const bucket = totalCount < 10 ? totalCount : totalCount < 100 ? Math.floor(totalCount / 10) * 10 : Math.floor(totalCount / 100) * 100;
	const parts = Object.keys(counts).sort().map(k => `${k}:${counts[k]}`);
	return `donut_${bucket}_${parts.join('|')}`;
}

/**
 * Generate an SVG donut string for a cluster.
 */
export function generateDonutSvg(
	counts: Record<string, number>,
	totalCount: number,
	registry: VisualKeyRegistry,
	size: number
): string {
	const slices = buildSlices(counts, totalCount, registry);

	const cx = size / 2;
	const cy = size / 2;
	const ringWidth = 6;
	const r = cx - ringWidth / 2 - 1; // radius of the ring center line
	const innerR = r - ringWidth / 2 - 2; // inner circle radius

	// Format count label
	const label = totalCount < 1000
		? String(totalCount)
		: totalCount < 10000
			? `${(totalCount / 1000).toFixed(1)}k`
			: `${Math.floor(totalCount / 1000)}k`;

	const fontSize = size < 46 ? 11 : 13;

	if (slices.length === 1) {
		// Single-color ring: just a circle stroke
		return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
	<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${slices[0].color}" stroke-width="${ringWidth}"/>
	<circle cx="${cx}" cy="${cy}" r="${innerR}" fill="white"/>
	<text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="bold" font-family="system-ui, sans-serif" fill="#374151">${label}</text>
</svg>`;
	}

	// Multi-slice donut: build arc paths
	let arcs = '';
	let startAngle = -Math.PI / 2; // start at top

	for (const slice of slices) {
		const sweepAngle = slice.fraction * 2 * Math.PI;
		const endAngle = startAngle + sweepAngle;

		const x1 = cx + r * Math.cos(startAngle);
		const y1 = cy + r * Math.sin(startAngle);
		const x2 = cx + r * Math.cos(endAngle);
		const y2 = cy + r * Math.sin(endAngle);

		const largeArc = sweepAngle > Math.PI ? 1 : 0;

		arcs += `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="${slice.color}" stroke-width="${ringWidth}" stroke-linecap="butt"/>`;

		startAngle = endAngle;
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
	${arcs}
	<circle cx="${cx}" cy="${cy}" r="${innerR}" fill="white"/>
	<text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="bold" font-family="system-ui, sans-serif" fill="#374151">${label}</text>
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
	totalCount: number,
	registry: VisualKeyRegistry
): DonutSlice[] {
	const entries = Object.entries(counts)
		.map(([key, count]) => ({
			key,
			color: registry.get(key)?.color ?? FALLBACK_COLOR,
			count,
			fraction: count / totalCount
		}))
		.sort((a, b) => b.count - a.count);

	// Merge slices below threshold
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
			color: FALLBACK_COLOR,
			count: otherCount,
			fraction: otherCount / totalCount
		});
	}

	// If everything was merged into "other" (unlikely but defensive)
	if (significant.length === 0) {
		significant.push({
			key: '_all',
			color: FALLBACK_COLOR,
			count: totalCount,
			fraction: 1
		});
	}

	return significant;
}
