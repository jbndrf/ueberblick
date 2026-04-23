/**
 * Derive a human-readable label for a workflow_instance.
 *
 * Instances are titled in the app by their workflow name alone ("Arbeitszeit"),
 * which makes a list of the same workflow indistinguishable. This helper picks
 * a primary identifier (first filled field, preferring a date field) and a
 * relative timestamp so callers can render e.g. "24.04.2026 · vor 2 Std".
 *
 * Upgrade path: when an admin-configured "title field" is introduced, prefer
 * that over the heuristic. The shape of InstanceLabel stays the same.
 */
export interface InstanceLabelInput {
	instance: {
		id: string;
		updated?: string;
		created?: string;
		current_stage_id?: string | null;
	};
	/** Field values that belong to `instance` only. */
	fieldValues?: Array<{
		field_key: string;
		value: string;
		created?: string;
	}>;
	/** Form fields for the instance's workflow. Visual layout decides which field is primary
	 *  (page -> row_index -> column_position left<full<right -> field_order). */
	formFields?: Array<{
		id: string;
		field_type?: string;
		field_order?: number;
		page?: number;
		row_index?: number;
		column_position?: 'left' | 'full' | 'right';
	}>;
	stageName?: string;
	locale?: 'de' | 'en';
}

export interface InstanceLabel {
	/** Primary identifier for the instance. Null if nothing useful to show. */
	primary: string | null;
	/** Relative time since `updated` (or `created`). Empty string if timestamps missing. */
	timeAgo: string;
	/** Current stage display name, if provided. */
	stage?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function formatValue(raw: string, fieldType: string | undefined, locale: 'de' | 'en'): string {
	if (!raw) return '';
	if (raw.startsWith('[')) {
		try {
			const arr = JSON.parse(raw);
			if (Array.isArray(arr) && arr.length) return arr.map(String).join(', ');
		} catch { /* fall through */ }
	}
	if (fieldType === 'date' || ISO_DATE.test(raw)) {
		const d = new Date(raw);
		if (!Number.isNaN(d.getTime())) {
			if (locale === 'de') {
				return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
			}
			return d.toLocaleDateString('en-US');
		}
	}
	const trimmed = raw.length > 40 ? raw.slice(0, 40) + '…' : raw;
	return trimmed;
}

function relativeTime(iso: string | undefined, locale: 'de' | 'en'): string {
	if (!iso) return '';
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return '';
	const diffSec = Math.floor((Date.now() - then) / 1000);
	const de = locale === 'de';
	if (diffSec < 60) return de ? 'gerade eben' : 'just now';
	const mins = Math.floor(diffSec / 60);
	if (mins < 60) return de ? `vor ${mins} Min` : `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return de ? `vor ${hrs} Std` : `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	if (days < 7) return de ? `vor ${days} Tg` : `${days}d ago`;
	const d = new Date(iso);
	if (de) {
		return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
	}
	return d.toLocaleDateString('en-US');
}

export function instanceLabel(input: InstanceLabelInput): InstanceLabel {
	const locale = input.locale ?? 'de';
	const fieldValues = input.fieldValues ?? [];
	const formFields = input.formFields ?? [];

	let primary: string | null = null;

	if (formFields.length > 0 && fieldValues.length > 0) {
		const byKey = new Map<string, { value: string; type?: string }>();
		for (const fv of fieldValues) {
			if (fv.value && !byKey.has(fv.field_key)) {
				byKey.set(fv.field_key, { value: fv.value });
			}
		}
		const colWeight = (c?: string) => (c === 'left' ? 0 : c === 'full' ? 1 : c === 'right' ? 2 : 3);
		const sorted = [...formFields].sort((a, b) => {
			const pa = a.page ?? Number.MAX_SAFE_INTEGER;
			const pb = b.page ?? Number.MAX_SAFE_INTEGER;
			if (pa !== pb) return pa - pb;
			const ra = a.row_index ?? Number.MAX_SAFE_INTEGER;
			const rb = b.row_index ?? Number.MAX_SAFE_INTEGER;
			if (ra !== rb) return ra - rb;
			const ca = colWeight(a.column_position);
			const cb = colWeight(b.column_position);
			if (ca !== cb) return ca - cb;
			return (a.field_order ?? Number.MAX_SAFE_INTEGER) - (b.field_order ?? Number.MAX_SAFE_INTEGER);
		});
		const preferDate = sorted.find((f) => f.field_type === 'date' && byKey.has(f.id));
		const pick = preferDate ?? sorted.find((f) => byKey.has(f.id));
		if (pick) {
			const entry = byKey.get(pick.id)!;
			primary = formatValue(entry.value, pick.field_type, locale) || null;
		}
	}

	if (!primary && fieldValues.length > 0) {
		const first = fieldValues.find((fv) => fv.value);
		if (first) primary = formatValue(first.value, undefined, locale) || null;
	}

	return {
		primary,
		timeAgo: relativeTime(input.instance.updated || input.instance.created, locale),
		stage: input.stageName
	};
}
