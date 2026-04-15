import * as m from '$lib/paraglide/messages';

export type CustomTable = {
	id: string;
	project_id: string;
	table_name: string;
	display_name: string;
	description: string | null;
	main_column: string;
	sort_order: number | null;
	visible_to_roles: string[];
	created: string;
	updated: string;
};

export const customTableColumns = {
	tableName: m.customTablesTableName?.() ?? 'Table Name',
	displayName: m.customTablesDisplayName?.() ?? 'Display Name',
	description: m.rolesDescription_field?.() ?? 'Description',
	mainColumn: m.customTablesMainColumn?.() ?? 'Main Column',
	visibleToRoles: m.customTablesVisibleToRoles?.() ?? 'Visible to Roles',
	created: m.customTablesCreated?.() ?? 'Created',
	actions: m.rolesActions?.() ?? 'Actions'
};
