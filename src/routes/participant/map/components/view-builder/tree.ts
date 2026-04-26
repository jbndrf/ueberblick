/**
 * Tree-shaped filter model used by the new builder UI.
 *
 * The on-disk shape (`ViewDefinition.clauses: FilterClause[]`) stays a flat
 * AND-list for now; `fromLegacy` / `toLegacy` translate to/from the tree at
 * load/save. Group-OR support is a follow-up: until `predicate.ts` learns
 * trees, `toLegacy` flattens groups (and warns if it has to drop a non-AND
 * combinator).
 */
import type { FilterClause } from '$lib/participant-state/types';
import type { FilterableFieldOption, FilterableFieldType } from './types';

export type Combinator = 'and' | 'or';

export type SourceKind = 'field_value' | 'stage' | 'created' | 'updated' | 'created_by';

/** What the user picked from the "+ Condition" picker. */
export type ClauseSource =
	| {
			kind: 'field_value';
			workflow_id: string;
			workflow_name: string;
			field_key: string;
			field_label: string;
			field_type: FilterableFieldType;
			options: { id: string; label: string }[];
	  }
	| { kind: 'stage'; workflow_id: string; workflow_name: string }
	| { kind: 'created' }
	| { kind: 'updated' }
	| { kind: 'created_by' };

export type Operator =
	| 'in'
	| 'not_in'
	| 'contains'
	| 'not_contains'
	| 'is_empty'
	| 'is_not_empty'
	| 'eq'
	| 'between'
	| 'older_than_days'
	| 'newer_than_days'
	| 'is_me';

export type ClauseValue =
	| { type: 'values'; values: string[] }
	| { type: 'text'; text: string }
	| { type: 'number_range'; min: number | null; max: number | null }
	| { type: 'date_range'; from: string | null; to: string | null }
	| { type: 'days'; days: number }
	| { type: 'none' };

export interface Clause {
	kind: 'clause';
	id: string;
	source: ClauseSource;
	op: Operator;
	value: ClauseValue;
}

export interface Group {
	kind: 'group';
	id: string;
	combinator: Combinator;
	children: Node[];
}

export type Node = Clause | Group;
export type FilterTree = Group;

let _id = 0;
export const nextId = () => `n${Date.now().toString(36)}_${(_id++).toString(36)}`;

export const emptyTree = (): FilterTree => ({
	kind: 'group',
	id: nextId(),
	combinator: 'and',
	children: []
});

// ─── source ⇄ legacy clause shape ───────────────────────────────────────

export function sourceKey(s: ClauseSource): string {
	switch (s.kind) {
		case 'field_value':
			return `fv|${s.workflow_id}|${s.field_key}`;
		case 'stage':
			return `stage|${s.workflow_id}`;
		case 'created':
			return 'created';
		case 'updated':
			return 'updated';
		case 'created_by':
			return 'created_by';
	}
}

/**
 * Build a fresh clause with sensible defaults for the chosen source.
 * Operator/value pair is the most "natural" first state: dropdowns start
 * empty `in`, text starts empty `contains`, etc.
 */
export function makeClause(source: ClauseSource): Clause {
	const id = nextId();
	switch (source.kind) {
		case 'stage':
			return { kind: 'clause', id, source, op: 'in', value: { type: 'values', values: [] } };
		case 'created':
		case 'updated':
			return {
				kind: 'clause',
				id,
				source,
				op: 'older_than_days',
				value: { type: 'days', days: 7 }
			};
		case 'created_by':
			return { kind: 'clause', id, source, op: 'in', value: { type: 'values', values: [] } };
		case 'field_value':
			switch (source.field_type) {
				case 'number':
					return {
						kind: 'clause',
						id,
						source,
						op: 'between',
						value: { type: 'number_range', min: null, max: null }
					};
				case 'date':
					return {
						kind: 'clause',
						id,
						source,
						op: 'between',
						value: { type: 'date_range', from: null, to: null }
					};
				case 'dropdown':
				case 'multiple_choice':
				case 'smart_dropdown':
				case 'custom_table_selector':
					return source.options.length > 0
						? { kind: 'clause', id, source, op: 'in', value: { type: 'values', values: [] } }
						: { kind: 'clause', id, source, op: 'contains', value: { type: 'text', text: '' } };
				default:
					return { kind: 'clause', id, source, op: 'contains', value: { type: 'text', text: '' } };
			}
	}
}

// ─── legacy adapters ────────────────────────────────────────────────────

export function fromLegacy(
	clauses: FilterClause[],
	fields: FilterableFieldOption[],
	workflowName: (id: string) => string
): FilterTree {
	const out = emptyTree();
	for (const c of clauses) out.children.push(legacyToClause(c, fields, workflowName));
	return out;
}

function legacyToClause(
	c: FilterClause,
	fields: FilterableFieldOption[],
	workflowName: (id: string) => string
): Clause {
	const id = nextId();
	if (c.field === 'stage') {
		return {
			kind: 'clause',
			id,
			source: { kind: 'stage', workflow_id: c.workflow_id, workflow_name: workflowName(c.workflow_id) },
			op: 'in',
			value: { type: 'values', values: c.values }
		};
	}
	if (c.field === 'field_value') {
		const f = fields.find((x) => x.workflow_id === c.workflow_id && x.field_key === c.field_key);
		const source: ClauseSource = {
			kind: 'field_value',
			workflow_id: c.workflow_id,
			workflow_name: f?.workflow_name ?? workflowName(c.workflow_id),
			field_key: c.field_key,
			field_label: f?.field_label ?? c.field_key,
			field_type: f?.field_type ?? 'short_text',
			options: f?.options ?? []
		};
		switch (c.op) {
			case 'in':
				return { kind: 'clause', id, source, op: 'in', value: { type: 'values', values: c.values } };
			case 'contains':
				return { kind: 'clause', id, source, op: 'contains', value: { type: 'text', text: c.text } };
			case 'number_range':
				return {
					kind: 'clause',
					id,
					source,
					op: 'between',
					value: { type: 'number_range', min: c.min, max: c.max }
				};
			case 'date_range':
				return {
					kind: 'clause',
					id,
					source,
					op: 'between',
					value: { type: 'date_range', from: c.from, to: c.to }
				};
		}
	}
	if (c.field === 'created' || c.field === 'updated') {
		const source: ClauseSource = { kind: c.field };
		if (c.op === 'between') {
			return {
				kind: 'clause',
				id,
				source,
				op: 'between',
				value: { type: 'date_range', from: c.from, to: c.to }
			};
		}
		return { kind: 'clause', id, source, op: c.op, value: { type: 'days', days: c.days } };
	}
	if (c.field === 'created_by') {
		return {
			kind: 'clause',
			id,
			source: { kind: 'created_by' },
			op: 'in',
			value: { type: 'values', values: c.values }
		};
	}
	throw new Error(`unreachable: unhandled FilterClause shape ${JSON.stringify(c)}`);
}

/**
 * Flatten the tree to the legacy AND-list. OR-groups are flattened too;
 * callers that care should warn the user before saving until
 * `predicate.ts` understands trees natively.
 */
export function toLegacy(tree: FilterTree): FilterClause[] {
	const out: FilterClause[] = [];
	walk(tree);
	return out;

	function walk(n: Node) {
		if (n.kind === 'group') {
			for (const c of n.children) walk(c);
			return;
		}
		const legacy = clauseToLegacy(n);
		if (legacy) out.push(legacy);
	}
}

function clauseToLegacy(c: Clause): FilterClause | null {
	const { source, op, value } = c;
	if (source.kind === 'stage') {
		if (op !== 'in' || value.type !== 'values') return null;
		return { field: 'stage', workflow_id: source.workflow_id, op: 'in', values: value.values };
	}
	if (source.kind === 'field_value') {
		const base = { field: 'field_value' as const, workflow_id: source.workflow_id, field_key: source.field_key };
		if (op === 'in' && value.type === 'values')
			return { ...base, op: 'in', values: value.values };
		if (op === 'contains' && value.type === 'text')
			return { ...base, op: 'contains', text: value.text };
		if (op === 'between' && value.type === 'number_range')
			return { ...base, op: 'number_range', min: value.min, max: value.max };
		if (op === 'between' && value.type === 'date_range')
			return { ...base, op: 'date_range', from: value.from, to: value.to };
		return null;
	}
	if (source.kind === 'created' || source.kind === 'updated') {
		if (op === 'between' && value.type === 'date_range')
			return { field: source.kind, op: 'between', from: value.from, to: value.to };
		if ((op === 'older_than_days' || op === 'newer_than_days') && value.type === 'days')
			return { field: source.kind, op, days: value.days };
		return null;
	}
	if (source.kind === 'created_by') {
		if (op === 'in' && value.type === 'values')
			return { field: 'created_by', op: 'in', values: value.values };
		return null;
	}
	return null;
}

// ─── tree mutators (immutable, for $state assignment) ───────────────────

export function findAndReplace(tree: FilterTree, id: string, next: Node | null): FilterTree {
	return mapNode(tree, id, next) as FilterTree;
}

function mapNode(node: Node, id: string, next: Node | null): Node | null {
	if (node.id === id) return next;
	if (node.kind !== 'group') return node;
	const children: Node[] = [];
	for (const c of node.children) {
		const m = mapNode(c, id, next);
		if (m) children.push(m);
	}
	return { ...node, children };
}

export function appendChild(tree: FilterTree, groupId: string, child: Node): FilterTree {
	return mapAppend(tree, groupId, child) as FilterTree;
}

function mapAppend(node: Node, groupId: string, child: Node): Node {
	if (node.kind !== 'group') return node;
	if (node.id === groupId) return { ...node, children: [...node.children, child] };
	return { ...node, children: node.children.map((c) => mapAppend(c, groupId, child)) };
}

export function setCombinator(tree: FilterTree, groupId: string, combinator: Combinator): FilterTree {
	return mapCombinator(tree, groupId, combinator) as FilterTree;
}

function mapCombinator(node: Node, groupId: string, combinator: Combinator): Node {
	if (node.kind !== 'group') return node;
	if (node.id === groupId) return { ...node, combinator };
	return { ...node, children: node.children.map((c) => mapCombinator(c, groupId, combinator)) };
}

export function depthOf(tree: FilterTree, groupId: string): number {
	const found = walk(tree, 0);
	return found ?? -1;

	function walk(node: Node, d: number): number | null {
		if (node.kind !== 'group') return null;
		if (node.id === groupId) return d;
		for (const c of node.children) {
			const r = walk(c, d + 1);
			if (r !== null) return r;
		}
		return null;
	}
}
