import type { FilterableFieldType } from './types';
import type { ClauseSource, ClauseValue, Operator } from './tree';

export function operatorsFor(source: ClauseSource): Operator[] {
	switch (source.kind) {
		case 'stage':
			return ['in', 'not_in'];
		case 'created':
		case 'updated':
			return ['between', 'older_than_days', 'newer_than_days'];
		case 'created_by':
			return ['in', 'is_me'];
		case 'field_value':
			return operatorsForFieldType(source.field_type, source.options.length > 0);
	}
}

function operatorsForFieldType(t: FilterableFieldType, hasOptions: boolean): Operator[] {
	switch (t) {
		case 'number':
			return ['eq', 'between', 'is_empty', 'is_not_empty'];
		case 'date':
			return ['between', 'older_than_days', 'newer_than_days', 'is_empty', 'is_not_empty'];
		case 'dropdown':
		case 'multiple_choice':
		case 'smart_dropdown':
		case 'custom_table_selector':
			return hasOptions
				? ['in', 'not_in', 'is_empty', 'is_not_empty']
				: ['contains', 'not_contains', 'is_empty', 'is_not_empty'];
		default:
			return ['contains', 'not_contains', 'is_empty', 'is_not_empty'];
	}
}

export function operatorLabel(op: Operator): string {
	switch (op) {
		case 'in': return 'is any of';
		case 'not_in': return 'is none of';
		case 'contains': return 'contains';
		case 'not_contains': return 'does not contain';
		case 'is_empty': return 'is empty';
		case 'is_not_empty': return 'is not empty';
		case 'eq': return 'equals';
		case 'between': return 'between';
		case 'older_than_days': return 'older than';
		case 'newer_than_days': return 'newer than';
		case 'is_me': return 'is me';
	}
}

/**
 * When the operator changes, the value shape may need to change with it.
 * Returns a fresh value compatible with the new operator, preserving
 * what we can from the old one.
 */
export function valueForOp(op: Operator, prev: ClauseValue): ClauseValue {
	switch (op) {
		case 'in':
		case 'not_in':
			return prev.type === 'values' ? prev : { type: 'values', values: [] };
		case 'contains':
		case 'not_contains':
		case 'eq':
			return prev.type === 'text' ? prev : { type: 'text', text: '' };
		case 'between':
			if (prev.type === 'number_range' || prev.type === 'date_range') return prev;
			return { type: 'number_range', min: null, max: null };
		case 'older_than_days':
		case 'newer_than_days':
			return prev.type === 'days' ? prev : { type: 'days', days: 7 };
		case 'is_empty':
		case 'is_not_empty':
		case 'is_me':
			return { type: 'none' };
	}
}
