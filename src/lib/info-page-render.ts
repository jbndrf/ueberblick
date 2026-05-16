import { sanitizeHtml } from './sanitize-html';

export type InfoPageContext = {
	token: string | null;
	loginLink: string | null;
};

export type InfoPageSegment =
	| { kind: 'html'; html: string }
	| { kind: 'qr'; value: string };

const QR_MARKERS: Array<{ token: string; resolve: (ctx: InfoPageContext) => string | null }> = [
	{ token: '$qrloginlink', resolve: (ctx) => ctx.loginLink },
	{ token: '$qrtoken', resolve: (ctx) => ctx.token }
];

const escapeForRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function substituteText(text: string, ctx: InfoPageContext): string {
	let out = text;
	if (ctx.loginLink !== null) {
		out = out.replace(/\$loginlink\b/g, ctx.loginLink);
	}
	if (ctx.token !== null) {
		out = out.replace(/\$token\b/g, ctx.token);
	}
	return out;
}

/**
 * Split info-page content into renderable segments. QR markers ($qrtoken,
 * $qrloginlink) become standalone `qr` segments; everything else is run
 * through text-variable substitution and then HTML-sanitized.
 *
 * Markers that reference a variable that's not available in the context
 * (no participant token in scope, etc.) are dropped silently — admins
 * embed them defensively and they should no-op outside the participant app.
 */
export function parseInfoPage(content: string, ctx: InfoPageContext): InfoPageSegment[] {
	if (!content) return [];

	const markerRe = new RegExp(
		QR_MARKERS.map((m) => escapeForRegex(m.token)).join('|'),
		'g'
	);

	const segments: InfoPageSegment[] = [];
	let cursor = 0;
	let match: RegExpExecArray | null;
	while ((match = markerRe.exec(content)) !== null) {
		if (match.index > cursor) {
			const raw = content.slice(cursor, match.index);
			segments.push({ kind: 'html', html: sanitizeHtml(substituteText(raw, ctx)) });
		}
		const marker = match[0];
		const def = QR_MARKERS.find((m) => m.token === marker);
		const value = def ? def.resolve(ctx) : null;
		if (value) segments.push({ kind: 'qr', value });
		cursor = match.index + marker.length;
	}
	if (cursor < content.length) {
		const raw = content.slice(cursor);
		segments.push({ kind: 'html', html: sanitizeHtml(substituteText(raw, ctx)) });
	}
	return segments;
}
