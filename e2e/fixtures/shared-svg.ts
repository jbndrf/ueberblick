// Shared SVG pin icons for filter_value_icons across all demo seeds.
// Each function returns a colored map-pin SVG string.

function pinSvg(fill: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}" stroke="#ffffff" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>`;
}

function circleSvg(fill: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${fill}" stroke="#ffffff" stroke-width="2"/></svg>`;
}

// Icon config object for use in filter_value_icons
export function pinIcon(fill: string) {
	return {
		type: 'svg',
		svgContent: pinSvg(fill),
		style: {
			size: 28,
			color: fill,
			borderWidth: 2,
			borderColor: '#ffffff',
			backgroundColor: 'transparent',
			shadow: true,
			shape: 'none'
		}
	};
}

export function circleIcon(fill: string) {
	return {
		type: 'svg',
		svgContent: circleSvg(fill),
		style: {
			size: 24,
			color: fill,
			borderWidth: 2,
			borderColor: '#ffffff',
			backgroundColor: 'transparent',
			shadow: false,
			shape: 'none'
		}
	};
}

// Stage visual_config helper (wraps icon in the expected structure)
export function stageIconConfig(color: string) {
	return {
		icon_config: circleIcon(color)
	};
}

// Common colors
export const COLORS = {
	RED: '#ef4444',
	ORANGE: '#f97316',
	YELLOW: '#eab308',
	GREEN: '#22c55e',
	LIGHT_GREEN: '#84cc16',
	BLUE: '#3b82f6',
	GRAY: '#9ca3af',
	PALE_YELLOW: '#fde68a'
} as const;
