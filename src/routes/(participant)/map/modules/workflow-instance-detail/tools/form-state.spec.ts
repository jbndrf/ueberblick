import { describe, it, expect } from 'vitest';
import { computeFieldsToClear } from './form-state';
import type { FormField } from '$lib/components/form-renderer/types';

function field(partial: Partial<FormField> & { id: string }): FormField {
	return {
		form_id: 'f1',
		field_label: partial.id,
		field_type: 'short_text',
		row_index: 0,
		column_position: 'full',
		write_mode: 'singleton',
		...partial
	} as FormField;
}

describe('computeFieldsToClear', () => {
	it('clears a singleton field hidden by conditional logic that had a saved value', () => {
		const fields = [
			field({ id: 'case' }),
			field({
				id: 'detail',
				field_label: 'Detail C',
				conditional_logic: { show_if: { op: 'includes', field: 'case', value: 'c' } }
			})
		];
		// User deselected case "c" — render context no longer satisfies show_if.
		const renderValues = { case: ['a'], detail: 'old detail' };
		const result = computeFieldsToClear(fields, {}, { detail: 'old detail' }, renderValues);
		expect(result).toEqual([{ id: 'detail', label: 'Detail C' }]);
	});

	it('does not clear a hidden field that never had a saved value', () => {
		const fields = [
			field({
				id: 'detail',
				conditional_logic: { show_if: { op: 'equals', field: 'case', value: 'c' } }
			})
		];
		const result = computeFieldsToClear(fields, {}, {}, { case: 'a' });
		expect(result).toEqual([]);
	});

	it('clears a visible field the user actively emptied (had a prior value)', () => {
		const fields = [field({ id: 'note', field_label: 'Note' })];
		const result = computeFieldsToClear(
			fields,
			{ note: '' }, // actively blanked in session
			{ note: 'previous' },
			{ note: '' }
		);
		expect(result).toEqual([{ id: 'note', label: 'Note' }]);
	});

	it('does not clear a still-visible field left untouched', () => {
		const fields = [field({ id: 'note', field_label: 'Note' })];
		// Untouched → not present in session values; prior value preserved.
		const result = computeFieldsToClear(fields, {}, { note: 'previous' }, { note: 'previous' });
		expect(result).toEqual([]);
	});

	it('ignores non-singleton fields', () => {
		const fields = [
			field({
				id: 'obs',
				write_mode: 'observation',
				conditional_logic: { show_if: { op: 'equals', field: 'case', value: 'c' } }
			})
		];
		const result = computeFieldsToClear(fields, {}, { obs: 'old' }, { case: 'a' });
		expect(result).toEqual([]);
	});

	it('does not clear a field that is still visible and non-empty', () => {
		const fields = [
			field({
				id: 'detail',
				conditional_logic: { show_if: { op: 'equals', field: 'case', value: 'c' } }
			})
		];
		const result = computeFieldsToClear(
			fields,
			{ detail: 'updated' },
			{ detail: 'old' },
			{ case: 'c', detail: 'updated' }
		);
		expect(result).toEqual([]);
	});
});
