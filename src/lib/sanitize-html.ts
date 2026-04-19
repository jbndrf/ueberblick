const ALLOWED_TAGS = new Set([
	'a', 'p', 'br', 'strong', 'em', 'b', 'i',
	'ul', 'ol', 'li',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
]);

const VOID_TAGS = new Set(['br']);

function escapeText(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function extractHref(attrString: string): string | null {
	const match = attrString.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
	if (!match) return null;
	const value = match[2] ?? match[3] ?? match[4] ?? '';
	if (/^\s*javascript:/i.test(value)) return null;
	return value;
}

export function sanitizeHtml(html: string): string {
	if (!html) return '';

	const out: string[] = [];
	const stack: string[] = [];
	const tokenRe = /<!--[\s\S]*?-->|<\/([a-zA-Z][a-zA-Z0-9]*)\s*>|<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*)?)\s*(\/?)>/g;

	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = tokenRe.exec(html)) !== null) {
		if (match.index > lastIndex) {
			out.push(escapeText(html.slice(lastIndex, match.index)));
		}
		lastIndex = tokenRe.lastIndex;

		if (match[0].startsWith('<!--')) continue;

		const closeTag = match[1];
		const openTag = match[2];

		if (closeTag) {
			const tag = closeTag.toLowerCase();
			if (!ALLOWED_TAGS.has(tag) || VOID_TAGS.has(tag)) continue;
			const idx = stack.lastIndexOf(tag);
			if (idx === -1) continue;
			while (stack.length > idx) {
				out.push(`</${stack.pop()}>`);
			}
			continue;
		}

		if (openTag) {
			const tag = openTag.toLowerCase();
			const attrString = match[3] ?? '';
			const selfClose = match[4] === '/' || VOID_TAGS.has(tag);

			if (!ALLOWED_TAGS.has(tag)) continue;

			if (tag === 'a') {
				const href = extractHref(attrString);
				const parts = ['<a'];
				if (href !== null) parts.push(` href="${escapeAttr(href)}"`);
				parts.push(' target="_blank" rel="noopener noreferrer">');
				out.push(parts.join(''));
				stack.push('a');
				continue;
			}

			if (selfClose) {
				out.push(`<${tag}>`);
				continue;
			}

			out.push(`<${tag}>`);
			stack.push(tag);
		}
	}

	if (lastIndex < html.length) {
		out.push(escapeText(html.slice(lastIndex)));
	}

	while (stack.length > 0) {
		out.push(`</${stack.pop()}>`);
	}

	return out.join('');
}

export function stripHtml(html: string): string {
	let text: string;
	if (typeof DOMParser !== 'undefined') {
		const doc = new DOMParser().parseFromString(html, 'text/html');
		text = doc.body.textContent ?? '';
	} else {
		text = html
			.replace(/<script[\s\S]*?<\/script>/gi, '')
			.replace(/<style[\s\S]*?<\/style>/gi, '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'");
	}
	return text.replace(/\s+/g, ' ').trim();
}
