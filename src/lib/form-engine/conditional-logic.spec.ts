import { describe, it, expect } from 'vitest';
import { evaluateShowIf, conditionalLogicSchema } from './conditional-logic';

const F = 'fdef_abc';

describe('evaluateShowIf', () => {
	it('returns true when logic is null/undefined/empty', () => {
		expect(evaluateShowIf(null, {})).toBe(true);
		expect(evaluateShowIf(undefined, {})).toBe(true);
		expect(evaluateShowIf({}, {})).toBe(true);
	});

	it('equals / not_equals', () => {
		expect(evaluateShowIf({ show_if: { op: 'equals', field: F, value: 'x' } }, { [F]: 'x' })).toBe(true);
		expect(evaluateShowIf({ show_if: { op: 'equals', field: F, value: 'x' } }, { [F]: 'y' })).toBe(false);
		expect(evaluateShowIf({ show_if: { op: 'not_equals', field: F, value: 'x' } }, { [F]: 'y' })).toBe(true);
	});

	it('includes against an array value', () => {
		expect(
			evaluateShowIf({ show_if: { op: 'includes', field: F, value: 'a' } }, { [F]: ['a', 'b'] })
		).toBe(true);
		expect(
			evaluateShowIf({ show_if: { op: 'includes', field: F, value: 'c' } }, { [F]: ['a', 'b'] })
		).toBe(false);
		expect(
			evaluateShowIf({ show_if: { op: 'not_includes', field: F, value: 'c' } }, { [F]: ['a', 'b'] })
		).toBe(true);
	});

	it('includes against a scalar falls back to equality', () => {
		expect(
			evaluateShowIf({ show_if: { op: 'includes', field: F, value: 'a' } }, { [F]: 'a' })
		).toBe(true);
	});

	it('is_empty / is_not_empty', () => {
		expect(evaluateShowIf({ show_if: { op: 'is_empty', field: F } }, {})).toBe(true);
		expect(evaluateShowIf({ show_if: { op: 'is_empty', field: F } }, { [F]: '' })).toBe(true);
		expect(evaluateShowIf({ show_if: { op: 'is_empty', field: F } }, { [F]: [] })).toBe(true);
		expect(evaluateShowIf({ show_if: { op: 'is_not_empty', field: F } }, { [F]: 'x' })).toBe(true);
	});

	it('missing field is treated as empty', () => {
		expect(evaluateShowIf({ show_if: { op: 'is_empty', field: F } }, {})).toBe(true);
		expect(evaluateShowIf({ show_if: { op: 'equals', field: F, value: 'x' } }, {})).toBe(false);
	});

	it('and / or composition', () => {
		const logic = {
			show_if: {
				op: 'and' as const,
				conds: [
					{ op: 'equals' as const, field: F, value: 'x' },
					{ op: 'is_not_empty' as const, field: 'other' }
				]
			}
		};
		expect(evaluateShowIf(logic, { [F]: 'x', other: 'y' })).toBe(true);
		expect(evaluateShowIf(logic, { [F]: 'x' })).toBe(false);

		const orLogic = {
			show_if: {
				op: 'or' as const,
				conds: [
					{ op: 'equals' as const, field: F, value: 'x' },
					{ op: 'equals' as const, field: F, value: 'y' }
				]
			}
		};
		expect(evaluateShowIf(orLogic, { [F]: 'y' })).toBe(true);
		expect(evaluateShowIf(orLogic, { [F]: 'z' })).toBe(false);
	});
});

describe('conditionalLogicSchema', () => {
	it('accepts valid shapes', () => {
		expect(conditionalLogicSchema.safeParse({}).success).toBe(true);
		expect(
			conditionalLogicSchema.safeParse({
				show_if: { op: 'includes', field: F, value: 'a' }
			}).success
		).toBe(true);
		expect(
			conditionalLogicSchema.safeParse({
				show_if: { op: 'and', conds: [{ op: 'is_empty', field: F }] }
			}).success
		).toBe(true);
	});

	it('rejects unknown op', () => {
		expect(
			conditionalLogicSchema.safeParse({ show_if: { op: 'wat', field: F, value: 1 } }).success
		).toBe(false);
	});

	it('rejects empty conds in and/or', () => {
		expect(
			conditionalLogicSchema.safeParse({ show_if: { op: 'and', conds: [] } }).success
		).toBe(false);
	});
});
