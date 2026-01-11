/**
 * SVG validation utilities for marker icon designer
 */

export interface SvgValidationResult {
	valid: boolean;
	error?: string;
	metadata?: {
		width: number;
		height: number;
		size: number;
		hasColors: boolean;
		hasAnimations: boolean;
	};
}

const MAX_FILE_SIZE = 50 * 1024; // 50KB

/**
 * Validates SVG content from file or string
 */
export function validateSvg(content: string, fileSize?: number): SvgValidationResult {
	// Check if empty
	if (!content || content.trim().length === 0) {
		return { valid: false, error: 'SVG content is empty' };
	}

	// Check file size
	const size = fileSize || new Blob([content]).size;
	if (size > MAX_FILE_SIZE) {
		return {
			valid: false,
			error: `File size (${(size / 1024).toFixed(1)}KB) exceeds maximum allowed size (50KB)`
		};
	}

	// Check if it's valid XML/SVG
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(content, 'image/svg+xml');

		// Check for parser errors
		const parserError = doc.querySelector('parsererror');
		if (parserError) {
			return { valid: false, error: 'Invalid SVG: XML parsing error' };
		}

		// Check if root element is svg
		const svgElement = doc.querySelector('svg');
		if (!svgElement) {
			return { valid: false, error: 'Invalid SVG: No <svg> root element found' };
		}

		// Check for animations (not supported in static markers)
		const hasAnimations =
			doc.querySelector('animate') !== null ||
			doc.querySelector('animateTransform') !== null ||
			doc.querySelector('animateMotion') !== null;

		// Extract dimensions
		const width = parseFloat(svgElement.getAttribute('width') || '0') || 24;
		const height = parseFloat(svgElement.getAttribute('height') || '0') || 24;

		// Check for colors (to warn user they might be overridden)
		const hasColors =
			content.includes('fill=') ||
			content.includes('stroke=') ||
			content.includes('color=') ||
			content.includes('stop-color=');

		return {
			valid: true,
			metadata: {
				width,
				height,
				size,
				hasColors,
				hasAnimations
			}
		};
	} catch (error) {
		return {
			valid: false,
			error: `SVG validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Sanitizes SVG content for safe display
 */
export function sanitizeSvg(content: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(content, 'image/svg+xml');
	const svgElement = doc.querySelector('svg');

	if (!svgElement) return content;

	// Remove potentially dangerous elements and attributes
	const dangerousElements = ['script', 'iframe', 'object', 'embed', 'link'];
	const dangerousAttributes = ['onload', 'onerror', 'onclick', 'onmouseover'];

	dangerousElements.forEach((tag) => {
		svgElement.querySelectorAll(tag).forEach((el) => el.remove());
	});

	// Remove dangerous attributes from all elements
	svgElement.querySelectorAll('*').forEach((el) => {
		dangerousAttributes.forEach((attr) => {
			if (el.hasAttribute(attr)) {
				el.removeAttribute(attr);
			}
		});
	});

	return new XMLSerializer().serializeToString(svgElement);
}

/**
 * Extracts base64 data URL from SVG content
 */
export function svgToDataUrl(content: string): string {
	const sanitized = sanitizeSvg(content);
	const base64 = btoa(unescape(encodeURIComponent(sanitized)));
	return `data:image/svg+xml;base64,${base64}`;
}
