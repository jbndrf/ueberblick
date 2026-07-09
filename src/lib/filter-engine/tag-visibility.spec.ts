import { describe, it, expect } from 'vitest';
import { splitMultiValue, parseFilterValues, passesTagFilter } from './tag-visibility';

describe('splitMultiValue', () => {
	it('returns a single-element array for a plain value', () => {
		expect(splitMultiValue('stage-a')).toEqual(['stage-a']);
	});

	it('parses a JSON array (multiple_choice)', () => {
		expect(splitMultiValue('["a","b"]')).toEqual(['a', 'b']);
	});

	it('falls back to the raw value when the JSON is malformed', () => {
		expect(splitMultiValue('[not json')).toEqual(['[not json']);
	});
});

describe('passesTagFilter', () => {
	const WF = 'l0tje0gh8cdukga';
	const STAGE_A = 'fn7re9bl4hofkdj';
	const STAGE_B = 'qz4bxlbfjr8bhr7';

	// Two polygon instances of the same workflow, one per stage — the exact
	// shape that made stage filtering silently fail for shapes.
	const parsed = parseFilterValues(
		new Map([
			['poly-in-a', STAGE_A],
			['poly-in-b', STAGE_B]
		])
	);

	it('hides only the instance whose stage was toggled off', () => {
		const visible = new Map([[WF, new Set([STAGE_A])]]);
		expect(passesTagFilter('poly-in-a', WF, visible, parsed)).toBe(true);
		expect(passesTagFilter('poly-in-b', WF, visible, parsed)).toBe(false);
	});

	it('hides both when every stage is toggled off', () => {
		const visible = new Map([[WF, new Set<string>()]]);
		expect(passesTagFilter('poly-in-a', WF, visible, parsed)).toBe(false);
		expect(passesTagFilter('poly-in-b', WF, visible, parsed)).toBe(false);
	});

	it('shows everything when the workflow has no tag filter configured', () => {
		const visible = new Map<string, Set<string>>();
		expect(passesTagFilter('poly-in-a', WF, visible, parsed)).toBe(true);
		expect(passesTagFilter('poly-in-b', WF, visible, parsed)).toBe(true);
	});

	it('shows an instance that carries no filterable value', () => {
		const visible = new Map([[WF, new Set([STAGE_A])]]);
		expect(passesTagFilter('no-stage-yet', WF, visible, parsed)).toBe(true);
	});

	it('shows a multi-value instance when any one value is still visible', () => {
		const multi = parseFilterValues(new Map([['inst', '["red","blue"]']]));
		const visible = new Map([[WF, new Set(['blue'])]]);
		expect(passesTagFilter('inst', WF, visible, multi)).toBe(true);
	});
});
