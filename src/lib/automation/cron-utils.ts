/**
 * Client-safe cron utilities for the admin UI.
 * Validates cron expressions and generates human-readable descriptions.
 * No server-side dependencies.
 */

const DOW_NAMES: Record<string, string> = {
	'0': 'Sun',
	'1': 'Mon',
	'2': 'Tue',
	'3': 'Wed',
	'4': 'Thu',
	'5': 'Fri',
	'6': 'Sat',
	'7': 'Sun'
};

const DOW_SHORTCUTS: Record<string, string> = {
	'1-5': 'weekdays',
	'0,6': 'weekends',
	'6,0': 'weekends'
};

/**
 * Validate a 5-field cron expression.
 * Enforces minimum 15-minute interval.
 */
export function validateCron(cron: string): { valid: boolean; error?: string } {
	if (!cron || !cron.trim()) {
		return { valid: false, error: 'Cron expression is required' };
	}

	const parts = cron.trim().split(/\s+/);
	if (parts.length !== 5) {
		return { valid: false, error: 'Must have exactly 5 fields: minute hour day-of-month month day-of-week' };
	}

	const [minute, hour, dom, month, dow] = parts;

	// Validate ranges
	const ranges: [string, string, number, number][] = [
		[minute, 'minute', 0, 59],
		[hour, 'hour', 0, 23],
		[dom, 'day-of-month', 1, 31],
		[month, 'month', 1, 12],
		[dow, 'day-of-week', 0, 7]
	];

	for (const [field, name, min, max] of ranges) {
		const err = validateField(field, name, min, max);
		if (err) return { valid: false, error: err };
	}

	// Enforce minimum 15-minute interval
	const minInterval = getMinIntervalMinutes(minute, hour);
	if (minInterval < 15) {
		return { valid: false, error: `Minimum interval is 15 minutes (detected ~${minInterval} min)` };
	}

	return { valid: true };
}

function validateField(field: string, name: string, min: number, max: number): string | null {
	const segments = field.split(',');
	for (const seg of segments) {
		const err = validateSegment(seg.trim(), name, min, max);
		if (err) return err;
	}
	return null;
}

function validateSegment(seg: string, name: string, min: number, max: number): string | null {
	if (seg === '*') return null;

	// */N
	if (seg.startsWith('*/')) {
		const step = parseInt(seg.slice(2), 10);
		if (isNaN(step) || step < 1) return `Invalid step in ${name}: ${seg}`;
		return null;
	}

	// N-M or N-M/step
	if (seg.includes('-')) {
		const [rangePart, stepPart] = seg.split('/');
		const [fromStr, toStr] = rangePart.split('-');
		const from = parseInt(fromStr, 10);
		const to = parseInt(toStr, 10);
		if (isNaN(from) || isNaN(to)) return `Invalid range in ${name}: ${seg}`;
		if (from < min || from > max || to < min || to > max) return `${name} range out of bounds: ${seg} (${min}-${max})`;
		if (from > to) return `Invalid range in ${name}: start > end: ${seg}`;
		if (stepPart) {
			const step = parseInt(stepPart, 10);
			if (isNaN(step) || step < 1) return `Invalid step in ${name}: ${seg}`;
		}
		return null;
	}

	// Plain number
	const num = parseInt(seg, 10);
	if (isNaN(num)) return `Invalid value in ${name}: ${seg}`;
	if (num < min || num > max) return `${name} out of range: ${seg} (${min}-${max})`;
	return null;
}

/**
 * Estimate the minimum interval in minutes for the given minute and hour fields.
 */
function getMinIntervalMinutes(minute: string, hour: string): number {
	// */N in minutes -- interval is N minutes
	if (minute.startsWith('*/')) {
		const step = parseInt(minute.slice(2), 10);
		return isNaN(step) ? 60 : step;
	}

	// * in minutes with specific hour -- every minute in that hour
	if (minute === '*' && hour !== '*') {
		return 1;
	}

	// * in both -- every minute
	if (minute === '*' && hour === '*') {
		return 1;
	}

	// Specific minutes -- check gaps
	if (minute.includes(',')) {
		const values = minute.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n)).sort((a, b) => a - b);
		if (values.length > 1) {
			let minGap = 60;
			for (let i = 1; i < values.length; i++) {
				minGap = Math.min(minGap, values[i] - values[i - 1]);
			}
			// If hour is also specific, the gap between last minute of one run and first of next
			// is at least 60 - (last - first) minutes. But for safety, use the within-hour gap.
			return minGap;
		}
	}

	// Range in minutes
	if (minute.includes('-') && !minute.includes('/')) {
		return 1; // Every minute in the range
	}
	if (minute.includes('-') && minute.includes('/')) {
		const step = parseInt(minute.split('/')[1], 10);
		return isNaN(step) ? 60 : step;
	}

	// Single minute value -- interval depends on hour
	if (hour === '*') return 60; // Once per hour
	if (hour.startsWith('*/')) {
		const step = parseInt(hour.slice(2), 10);
		return isNaN(step) ? 60 : step * 60;
	}

	// Specific hour + specific minute = once per day minimum
	return 1440;
}

/**
 * Generate a human-readable description of a 5-field cron expression.
 */
export function describeCron(cron: string): string {
	if (!cron || !cron.trim()) return 'Enter a cron expression (e.g. 0 2 * * 1-5)';

	const parts = cron.trim().split(/\s+/);
	if (parts.length !== 5) return 'Invalid: must have 5 fields';

	const [minute, hour, _dom, _month, dow] = parts;
	const segments: string[] = [];

	// Day of week
	if (dow === '*') {
		segments.push('Every day');
	} else if (DOW_SHORTCUTS[dow]) {
		segments.push(`Every ${DOW_SHORTCUTS[dow]}`);
	} else if (dow.includes(',')) {
		const days = dow.split(',').map((d) => DOW_NAMES[d.trim()] ?? d.trim()).join(', ');
		segments.push(`On ${days}`);
	} else if (dow.includes('-')) {
		const [from, to] = dow.split('-');
		segments.push(`${DOW_NAMES[from] ?? from}-${DOW_NAMES[to] ?? to}`);
	} else if (DOW_NAMES[dow]) {
		segments.push(`Every ${DOW_NAMES[dow]}`);
	} else {
		segments.push(`Day-of-week: ${dow}`);
	}

	// Time
	if (hour !== '*' && minute !== '*') {
		segments.push(`at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`);
	} else if (minute.startsWith('*/')) {
		segments.push(`every ${minute.slice(2)} minutes`);
	} else if (hour.startsWith('*/')) {
		segments.push(`every ${hour.slice(2)} hours`);
	} else if (minute === '*' && hour !== '*') {
		segments.push(`every minute during hour ${hour}`);
	}

	return segments.join(' ') || cron;
}
