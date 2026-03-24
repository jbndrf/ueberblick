/**
 * CSV parser with auto-detected delimiter.
 * Handles quoted fields, delimiters within quotes, escaped quotes ("").
 * Supports comma, semicolon, and tab delimiters.
 */
export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
	const delimiter = detectDelimiter(text);
	const lines = parseCSVLines(text, delimiter);
	if (lines.length === 0) return { headers: [], rows: [] };

	const headers = lines[0];
	const rows = lines.slice(1).filter((row) => row.some((cell) => cell.trim() !== ''));

	return { headers, rows };
}

function detectDelimiter(text: string): string {
	// Look at the first line (before any newline)
	const firstLine = text.split(/\r?\n/)[0] || '';

	// Count occurrences of common delimiters outside of quotes
	const candidates = [';', ',', '\t'];
	let best = ',';
	let bestCount = 0;

	for (const delim of candidates) {
		let count = 0;
		let inQuotes = false;
		for (const char of firstLine) {
			if (char === '"') inQuotes = !inQuotes;
			else if (char === delim && !inQuotes) count++;
		}
		if (count > bestCount) {
			bestCount = count;
			best = delim;
		}
	}

	return best;
}

function parseCSVLines(text: string, delimiter: string): string[][] {
	const lines: string[][] = [];
	let current: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;

	while (i < text.length) {
		const char = text[i];

		if (inQuotes) {
			if (char === '"') {
				if (i + 1 < text.length && text[i + 1] === '"') {
					field += '"';
					i += 2;
				} else {
					inQuotes = false;
					i++;
				}
			} else {
				field += char;
				i++;
			}
		} else {
			if (char === '"' && field === '') {
				inQuotes = true;
				i++;
			} else if (char === delimiter) {
				current.push(field.trim());
				field = '';
				i++;
			} else if (char === '\n' || char === '\r') {
				current.push(field.trim());
				field = '';
				lines.push(current);
				current = [];
				if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
					i += 2;
				} else {
					i++;
				}
			} else {
				field += char;
				i++;
			}
		}
	}

	if (field !== '' || current.length > 0) {
		current.push(field.trim());
		lines.push(current);
	}

	return lines;
}
