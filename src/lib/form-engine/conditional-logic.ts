import { z } from 'zod';

const leafEquality = z.object({
	op: z.enum(['equals', 'not_equals']),
	field: z.string().min(1),
	value: z.unknown()
});

const leafMembership = z.object({
	op: z.enum(['includes', 'not_includes']),
	field: z.string().min(1),
	value: z.unknown()
});

const leafEmptiness = z.object({
	op: z.enum(['is_empty', 'is_not_empty']),
	field: z.string().min(1)
});

export const fieldConditionSchema: z.ZodType<FieldCondition> = z.lazy(() =>
	z.union([
		leafEquality,
		leafMembership,
		leafEmptiness,
		z.object({ op: z.enum(['and', 'or']), conds: z.array(fieldConditionSchema).min(1) })
	])
);

export const conditionalLogicSchema = z
	.object({ show_if: fieldConditionSchema.optional() })
	.strict();

export type FieldCondition =
	| { op: 'equals' | 'not_equals'; field: string; value: unknown }
	| { op: 'includes' | 'not_includes'; field: string; value: unknown }
	| { op: 'is_empty' | 'is_not_empty'; field: string }
	| { op: 'and' | 'or'; conds: FieldCondition[] };

export type ConditionalLogic = { show_if?: FieldCondition };

function isEmpty(v: unknown): boolean {
	if (v == null) return true;
	if (typeof v === 'string') return v.length === 0;
	if (Array.isArray(v)) return v.length === 0;
	return false;
}

function eq(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a == null || b == null) return false;
	return String(a) === String(b);
}

function evaluate(cond: FieldCondition, values: Record<string, unknown>): boolean {
	switch (cond.op) {
		case 'equals':
			return eq(values[cond.field], cond.value);
		case 'not_equals':
			return !eq(values[cond.field], cond.value);
		case 'includes': {
			const v = values[cond.field];
			if (Array.isArray(v)) return v.some((x) => eq(x, cond.value));
			return eq(v, cond.value);
		}
		case 'not_includes': {
			const v = values[cond.field];
			if (Array.isArray(v)) return !v.some((x) => eq(x, cond.value));
			return !eq(v, cond.value);
		}
		case 'is_empty':
			return isEmpty(values[cond.field]);
		case 'is_not_empty':
			return !isEmpty(values[cond.field]);
		case 'and':
			return cond.conds.every((c) => evaluate(c, values));
		case 'or':
			return cond.conds.some((c) => evaluate(c, values));
	}
}

export function evaluateShowIf(
	logic: ConditionalLogic | null | undefined,
	values: Record<string, unknown>
): boolean {
	if (!logic || !logic.show_if) return true;
	return evaluate(logic.show_if, values);
}
