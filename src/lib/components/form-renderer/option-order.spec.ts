import { describe, it, expect } from 'vitest';
import { orderByCanonical } from './option-order';

describe('orderByCanonical', () => {
	it('reorders selected values into canonical option order', () => {
		expect(
			orderByCanonical(
				['Prüfpunkt 2', 'Prüfpunkt 4', 'Prüfpunkt 3', 'Prüfpunkt 1'],
				['Prüfpunkt 1', 'Prüfpunkt 2', 'Prüfpunkt 3', 'Prüfpunkt 4', 'Prüfpunkt 5']
			)
		).toEqual(['Prüfpunkt 1', 'Prüfpunkt 2', 'Prüfpunkt 3', 'Prüfpunkt 4']);
	});

	it('appends unknown values last, preserving their relative order', () => {
		expect(orderByCanonical(['z', 'b', 'y', 'a'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'z', 'y']);
	});

	it('is a no-op for 0 or 1 selected values', () => {
		expect(orderByCanonical([], ['a', 'b'])).toEqual([]);
		expect(orderByCanonical(['b'], ['a', 'b'])).toEqual(['b']);
	});

	it('handles an empty canonical list by preserving input order', () => {
		expect(orderByCanonical(['b', 'a'], [])).toEqual(['b', 'a']);
	});

	it('keeps the first index for duplicated canonical entries', () => {
		expect(orderByCanonical(['c', 'a'], ['a', 'b', 'a', 'c'])).toEqual(['a', 'c']);
	});
});
