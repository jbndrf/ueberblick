import { describe, expect, it } from 'vitest';
import { roleHasAccess, toggleRoleInList } from './permissions';

const ALL = ['r1', 'r2', 'r3'];

describe('roleHasAccess', () => {
	it('empty / nullish list means every role has access', () => {
		expect(roleHasAccess('r1', [])).toBe(true);
		expect(roleHasAccess('r1', undefined)).toBe(true);
		expect(roleHasAccess('r1', null)).toBe(true);
	});

	it('explicit list grants only the listed roles', () => {
		expect(roleHasAccess('r1', ['r1'])).toBe(true);
		expect(roleHasAccess('r2', ['r1'])).toBe(false);
	});
});

describe('toggleRoleInList', () => {
	it('toggling a role off from "all" yields every other role', () => {
		expect(toggleRoleInList([], 'r2', ALL).sort()).toEqual(['r1', 'r3']);
	});

	it('treats nullish current as "all"', () => {
		expect(toggleRoleInList(undefined, 'r1', ALL).sort()).toEqual(['r2', 'r3']);
	});

	it('removing a role from an explicit list keeps the remainder explicit', () => {
		expect(toggleRoleInList(['r1', 'r2'], 'r1', ALL)).toEqual(['r2']);
	});

	it('adding a role to a partial list keeps it explicit while incomplete', () => {
		expect(toggleRoleInList(['r1'], 'r2', ALL).sort()).toEqual(['r1', 'r2']);
	});

	it('collapses to empty (= all) when adding a role would cover everyone', () => {
		expect(toggleRoleInList(['r1', 'r3'], 'r2', ALL)).toEqual([]);
	});

	it('round-trips: toggle off then on returns to "all" (empty)', () => {
		const off = toggleRoleInList([], 'r2', ALL);
		expect(toggleRoleInList(off, 'r2', ALL)).toEqual([]);
	});

	it('single-role project: empty stays empty (cannot express "no roles")', () => {
		expect(toggleRoleInList([], 'r1', ['r1'])).toEqual([]);
	});
});
