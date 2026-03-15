/**
 * Marker style presets and shape generation utilities
 */

export type MarkerShape =
	| 'none'
	| 'circle'
	| 'square'
	| 'rounded'
	| 'hexagon'
	| 'diamond'
	| 'star'
	| 'shield';

export interface MarkerStyle {
	shape: MarkerShape;
	iconColor: string;
	backgroundColor: string;
	size: number;
	borderWidth: number;
	borderColor: string;
	dropShadow: boolean;
	shadowOffsetX?: number;
	shadowOffsetY?: number;
	shadowBlur?: number;
	shadowOpacity?: number;
}

export const DEFAULT_MARKER_STYLE: MarkerStyle = {
	shape: 'circle',
	iconColor: '#2563EB',
	backgroundColor: '#FFFFFF',
	size: 32,
	borderWidth: 2,
	borderColor: '#E2E8F0',
	dropShadow: true,
	shadowOffsetX: 0,
	shadowOffsetY: 2,
	shadowBlur: 4,
	shadowOpacity: 0.1
};

export const COLOR_PRESETS = {
	icon: [
		{ name: 'Blue', value: '#2563EB' },
		{ name: 'Red', value: '#DC2626' },
		{ name: 'Green', value: '#16A34A' },
		{ name: 'Yellow', value: '#CA8A04' },
		{ name: 'Purple', value: '#9333EA' },
		{ name: 'Orange', value: '#EA580C' },
		{ name: 'Pink', value: '#DB2777' },
		{ name: 'Teal', value: '#0D9488' }
	],
	background: [
		{ name: 'White', value: '#FFFFFF' },
		{ name: 'Light', value: '#F1F5F9' },
		{ name: 'Dark', value: '#1E293B' },
		{ name: 'Transparent', value: 'transparent' }
	]
};


/**
 * Generates SVG clip-path for different marker shapes
 */
export function getShapeClipPath(shape: MarkerShape): string {
	switch (shape) {
		case 'none':
			return '';
		case 'circle':
			return 'circle(50% at 50% 50%)';
		case 'square':
			return 'inset(0% 0% 0% 0%)';
		case 'rounded':
			return 'inset(0% 0% 0% 0% round 20%)';
		case 'hexagon':
			return 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
		case 'diamond':
			return 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
		case 'star':
			return 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
		case 'shield':
			return 'polygon(50% 0%, 100% 20%, 100% 60%, 50% 100%, 0% 60%, 0% 20%)';
		default:
			return '';
	}
}

/**
 * Gets display label for shape
 */
export function getShapeLabel(shape: MarkerShape): string {
	const labels: Record<MarkerShape, string> = {
		none: 'None',
		circle: 'Circle',
		square: 'Square',
		rounded: 'Rounded',
		hexagon: 'Hexagon',
		diamond: 'Diamond',
		star: 'Star',
		shield: 'Shield'
	};
	return labels[shape];
}


/**
 * Generates CSS filter for drop shadow
 */
export function getShadowFilter(style: MarkerStyle): string {
	if (!style.dropShadow) return '';

	const offsetX = style.shadowOffsetX || 0;
	const offsetY = style.shadowOffsetY || 2;
	const blur = style.shadowBlur || 4;
	const opacity = style.shadowOpacity || 0.1;

	return `drop-shadow(${offsetX}px ${offsetY}px ${blur}px rgba(0, 0, 0, ${opacity}))`;
}
