/**
 * IndexedDB Query Module
 *
 * Parses PocketBase filter syntax and applies it to record arrays.
 * Enables full offline query support for IndexedDB-cached records.
 */

// =============================================================================
// Types
// =============================================================================

type Operator = '=' | '!=' | '>' | '<' | '>=' | '<=' | '~';
type Logic = 'AND' | 'OR';

interface Condition {
	field: string;
	operator: Operator;
	value: unknown;
}

interface FilterGroup {
	logic: Logic;
	conditions: (Condition | FilterGroup)[];
}

interface SortField {
	field: string;
	descending: boolean;
}

export interface QueryOptions {
	filter?: string;
	sort?: string;
}

// =============================================================================
// Value Parsing
// =============================================================================

function parseValue(raw: string): unknown {
	raw = raw.trim();

	// String: "value" or 'value'
	if (
		(raw.startsWith('"') && raw.endsWith('"')) ||
		(raw.startsWith("'") && raw.endsWith("'"))
	) {
		return raw.slice(1, -1);
	}

	// Boolean
	if (raw === 'true') return true;
	if (raw === 'false') return false;

	// Null
	if (raw === 'null') return null;

	// Number
	const num = Number(raw);
	if (!isNaN(num)) return num;

	// Default to string
	return raw;
}

// =============================================================================
// Filter Parsing
// =============================================================================

const OPERATORS: Operator[] = ['!=', '>=', '<=', '>', '<', '~', '='];

function parseCondition(expr: string): Condition {
	for (const op of OPERATORS) {
		const idx = expr.indexOf(op);
		if (idx !== -1) {
			return {
				field: expr.slice(0, idx).trim(),
				operator: op,
				value: parseValue(expr.slice(idx + op.length))
			};
		}
	}
	throw new Error(`Invalid condition: ${expr}`);
}

export function parseFilter(filter: string): FilterGroup | null {
	if (!filter || !filter.trim()) return null;

	// Handle OR (lower precedence, split first)
	if (filter.includes(' || ')) {
		const parts = filter.split(' || ');
		return {
			logic: 'OR',
			conditions: parts.map((p) => {
				const inner = parseFilter(p.trim());
				return inner || parseCondition(p.trim());
			})
		};
	}

	// Handle AND
	if (filter.includes(' && ')) {
		const parts = filter.split(' && ');
		return {
			logic: 'AND',
			conditions: parts.map((p) => parseCondition(p.trim()))
		};
	}

	// Single condition
	return {
		logic: 'AND',
		conditions: [parseCondition(filter.trim())]
	};
}

// =============================================================================
// Sort Parsing
// =============================================================================

export function parseSort(sort: string): SortField[] {
	if (!sort || !sort.trim()) return [];

	return sort.split(',').map((s) => {
		s = s.trim();
		const descending = s.startsWith('-');
		const field = descending ? s.slice(1) : s;
		return { field, descending };
	});
}

// =============================================================================
// Filter Evaluation
// =============================================================================

function evaluateCondition(record: Record<string, unknown>, cond: Condition): boolean {
	const fieldValue = record[cond.field];
	const targetValue = cond.value;

	switch (cond.operator) {
		case '=':
			return fieldValue === targetValue;
		case '!=':
			return fieldValue !== targetValue;
		case '>':
			return (fieldValue as number) > (targetValue as number);
		case '<':
			return (fieldValue as number) < (targetValue as number);
		case '>=':
			return (fieldValue as number) >= (targetValue as number);
		case '<=':
			return (fieldValue as number) <= (targetValue as number);
		case '~':
			// Contains (case-insensitive)
			return String(fieldValue).toLowerCase().includes(String(targetValue).toLowerCase());
		default:
			return false;
	}
}

function evaluateFilter(record: Record<string, unknown>, group: FilterGroup): boolean {
	const results = group.conditions.map((cond) => {
		if ('logic' in cond) {
			// Nested group
			return evaluateFilter(record, cond);
		}
		return evaluateCondition(record, cond);
	});

	return group.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

// =============================================================================
// Sort Execution
// =============================================================================

function compareValues(a: unknown, b: unknown): number {
	// Handle null/undefined
	if (a == null && b == null) return 0;
	if (a == null) return -1;
	if (b == null) return 1;

	// String comparison
	if (typeof a === 'string' && typeof b === 'string') {
		return a.localeCompare(b);
	}

	// Number comparison
	if (typeof a === 'number' && typeof b === 'number') {
		return a - b;
	}

	// Boolean comparison
	if (typeof a === 'boolean' && typeof b === 'boolean') {
		return a === b ? 0 : a ? 1 : -1;
	}

	// Fallback: convert to string
	const strA = String(a);
	const strB = String(b);
	return strA.localeCompare(strB);
}

function sortRecords<T extends Record<string, unknown>>(
	records: T[],
	sortFields: SortField[]
): T[] {
	if (sortFields.length === 0) return records;

	return [...records].sort((a, b) => {
		for (const { field, descending } of sortFields) {
			const aVal = a[field];
			const bVal = b[field];

			const cmp = compareValues(aVal, bVal);

			if (cmp !== 0) {
				return descending ? -cmp : cmp;
			}
		}
		return 0;
	});
}

// =============================================================================
// Main Query API
// =============================================================================

/**
 * Query records with PocketBase-compatible filter and sort syntax.
 *
 * @example
 * // Filter by status
 * query(records, { filter: 'status = "active"' })
 *
 * // Multiple conditions with AND
 * query(records, { filter: 'workflow_id = "abc" && from_stage_id = ""' })
 *
 * // OR conditions
 * query(records, { filter: 'id = "a" || id = "b"' })
 *
 * // Sort descending
 * query(records, { sort: '-created' })
 *
 * // Combined filter and sort
 * query(records, { filter: 'status = "active"', sort: '-created' })
 */
export function query<T extends Record<string, unknown>>(
	records: T[],
	options: QueryOptions
): T[] {
	let result = records;

	// Apply filter
	if (options.filter) {
		const filterGroup = parseFilter(options.filter);
		if (filterGroup) {
			result = result.filter((r) => evaluateFilter(r, filterGroup));
		}
	}

	// Apply sort
	if (options.sort) {
		const sortFields = parseSort(options.sort);
		result = sortRecords(result, sortFields);
	}

	return result;
}
