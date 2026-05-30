/**
 * Workflow Builder — permission role-list helpers.
 *
 * Permission fields (`allowed_roles`, `view_roles`, `self_edit_roles`, ...) all
 * follow the "empty array = all roles" convention. These helpers implement the
 * 3-state toggle and the access check shared by the permissions matrix; the
 * logic is ported from the roles-page `toggleRole` server action so both
 * surfaces behave identically.
 */

/** Empty or missing list means "all roles". */
export function roleHasAccess(roleId: string, allowedRoles: string[] | undefined | null): boolean {
	return !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(roleId);
}

/**
 * Toggle one role in a permission list, preserving the "empty = all" convention.
 *
 * - empty list (= all roles): toggling a role OFF yields every *other* role
 * - explicit list containing the role: remove it; if the result still covers
 *   everyone, collapse back to empty (= all)
 * - explicit list missing the role: add it; if the result now covers everyone,
 *   collapse to empty (= all)
 *
 * Note: with a single-role project the "empty = all" convention cannot express
 * "no roles", so toggling the only role off resolves back to empty (= all).
 */
export function toggleRoleInList(
	current: string[] | undefined | null,
	roleId: string,
	allRoleIds: string[]
): string[] {
	const currentRoles = current ?? [];
	let next: string[];
	if (currentRoles.length === 0) {
		next = allRoleIds.filter((id) => id !== roleId);
	} else if (currentRoles.includes(roleId)) {
		next = currentRoles.filter((id) => id !== roleId);
		if (next.length >= allRoleIds.length) next = [];
	} else {
		next = [...currentRoles, roleId];
		if (allRoleIds.every((id) => next.includes(id))) next = [];
	}
	return next;
}
