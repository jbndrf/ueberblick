/**
 * Built-in SVG icon templates for the marker icon designer.
 * All icons use viewBox="0 0 24 24" for consistent sizing.
 */

export interface SvgIconTemplate {
	id: string;
	label: string;
	/** Raw SVG path content (without wrapping <svg> tag) using fill="currentColor" */
	path: string;
}

export interface BadgeTemplate {
	id: string;
	label: string;
	color: string;
	/** Raw SVG path content */
	path: string;
}

// ── Main icon templates ──────────────────────────────────────────────

export const ICON_TEMPLATES: SvgIconTemplate[] = [
	{
		id: 'circle',
		label: 'Circle',
		path: '<circle cx="12" cy="12" r="10" fill="currentColor"/>'
	},
	{
		id: 'square',
		label: 'Square',
		path: '<rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor"/>'
	},
	{
		id: 'triangle',
		label: 'Triangle',
		path: '<path d="M12 2L22 20H2L12 2Z" fill="currentColor"/>'
	},
	{
		id: 'diamond',
		label: 'Diamond',
		path: '<path d="M12 2L22 12L12 22L2 12L12 2Z" fill="currentColor"/>'
	},
	{
		id: 'hexagon',
		label: 'Hexagon',
		path: '<path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2Z" fill="currentColor"/>'
	},
	{
		id: 'pentagon',
		label: 'Pentagon',
		path: '<path d="M12 2l9.51 6.91L18.54 20H5.46L2.49 8.91L12 2Z" fill="currentColor"/>'
	},
	{
		id: 'pin',
		label: 'Pin',
		path: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" fill="currentColor"/>'
	},
	{
		id: 'flag',
		label: 'Flag',
		path: '<path d="M5 2v20M5 4h11l-3 4 3 4H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
	},
	{
		id: 'cross',
		label: 'Cross',
		path: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
	}
];

// ── Badge templates (preset colors, no picker) ──────────────────────

export const BADGE_TEMPLATES: BadgeTemplate[] = [
	{
		id: 'check',
		label: 'Check',
		color: '#16A34A',
		path: '<path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="3.75" stroke-linecap="round" stroke-linejoin="round"/>'
	},
	{
		id: 'question',
		label: 'Question',
		color: '#DC2626',
		path: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="currentColor" stroke-width="1.25"/>'
	},
	{
		id: 'exclamation',
		label: 'Alert',
		color: '#CA8A04',
		path: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" fill="none" stroke="currentColor" stroke-width="2.5"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="currentColor" stroke-width="1.25"/>'
	},
	{
		id: 'info',
		label: 'Info',
		color: '#2563EB',
		path: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.5"/><line x1="12" y1="16" x2="12" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="currentColor" stroke-width="1.25"/>'
	},
	{
		id: 'x-mark',
		label: 'X Mark',
		color: '#DC2626',
		path: '<path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="3.75" stroke-linecap="round"/>'
	},
	{
		id: 'clock',
		label: 'Clock',
		color: '#EA580C',
		path: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 6v6l4 2" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>'
	}
];

// ── SVG composition ─────────────────────────────────────────────────

/**
 * Composites a main icon + optional badge into a single SVG string.
 * This is the final SVG that gets stored in icon_config.svgContent.
 */
export function compositeIconSvg(options: {
	/** Raw SVG content (either a template path or a full custom SVG's inner content) */
	mainSvg: string;
	/** Whether mainSvg is a full <svg>...</svg> or just path content */
	isFullSvg: boolean;
	mainColor: string;
	bgShape: 'none';
	bgColor: string;
	size: number;
	badge?: BadgeTemplate;
}): string {
	const { mainSvg, isFullSvg, mainColor, size, badge } = options;

	const parts: string[] = [];

	// Main icon
	if (isFullSvg) {
		const encoded = btoa(unescape(encodeURIComponent(mainSvg)));
		const dataUrl = `data:image/svg+xml;base64,${encoded}`;
		parts.push(
			`<image href="${dataUrl}" x="0" y="0" width="${size}" height="${size}"/>`
		);
	} else {
		const coloredPath = mainSvg.replaceAll('currentColor', mainColor);
		parts.push(
			`<svg x="0" y="0" width="${size}" height="${size}" viewBox="0 0 24 24">${coloredPath}</svg>`
		);
	}

	// Badge overlay (top-right corner)
	if (badge) {
		const badgeSize = size * 0.4;
		const badgeX = size - badgeSize;
		const badgeY = 0;
		const coloredBadge = badge.path.replaceAll('currentColor', badge.color);
		parts.push(
			`<circle cx="${badgeX + badgeSize / 2}" cy="${badgeY + badgeSize / 2}" r="${badgeSize / 2 + 1}" fill="white"/>`
		);
		parts.push(
			`<svg x="${badgeX}" y="${badgeY}" width="${badgeSize}" height="${badgeSize}" viewBox="0 0 24 24">${coloredBadge}</svg>`
		);
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${parts.join('')}</svg>`;
}
