const ALLOWED_TAGS = new Set([
	'a', 'p', 'br', 'strong', 'em', 'b', 'i',
	'ul', 'ol', 'li',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
	a: new Set(['href', 'target', 'rel'])
};

export function sanitizeHtml(html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');

	function clean(node: Node): Node | null {
		if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();

		if (node.nodeType !== Node.ELEMENT_NODE) return null;

		const el = node as Element;
		const tag = el.tagName.toLowerCase();

		if (!ALLOWED_TAGS.has(tag)) {
			const fragment = document.createDocumentFragment();
			for (const child of el.childNodes) {
				const cleaned = clean(child);
				if (cleaned) fragment.appendChild(cleaned);
			}
			return fragment;
		}

		const newEl = document.createElement(tag);
		const allowedAttrs = ALLOWED_ATTRS[tag];
		if (allowedAttrs) {
			for (const attr of el.attributes) {
				if (allowedAttrs.has(attr.name)) {
					let value = attr.value;
					if (attr.name === 'href' && /^javascript:/i.test(value.trim())) continue;
					newEl.setAttribute(attr.name, value);
				}
			}
			if (tag === 'a') {
				newEl.setAttribute('target', '_blank');
				newEl.setAttribute('rel', 'noopener noreferrer');
			}
		}

		for (const child of el.childNodes) {
			const cleaned = clean(child);
			if (cleaned) newEl.appendChild(cleaned);
		}

		return newEl;
	}

	const fragment = document.createDocumentFragment();
	for (const child of doc.body.childNodes) {
		const cleaned = clean(child);
		if (cleaned) fragment.appendChild(cleaned);
	}

	const div = document.createElement('div');
	div.appendChild(fragment);
	return div.innerHTML;
}
