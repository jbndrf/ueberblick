import {
	customTablesCreated,
	customTablesDisplayName,
	customTablesMainColumn,
	customTablesTableName,
	customTablesVisibleToRoles,
	rolesActions,
	rolesDescription_field
} from '$lib/paraglide/messages';

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
	tableName: customTablesTableName?.() ?? 'Table Name',
	displayName: customTablesDisplayName?.() ?? 'Display Name',
	description: rolesDescription_field?.() ?? 'Description',
	mainColumn: customTablesMainColumn?.() ?? 'Main Column',
	visibleToRoles: customTablesVisibleToRoles?.() ?? 'Visible to Roles',
	created: customTablesCreated?.() ?? 'Created',
	actions: rolesActions?.() ?? 'Actions'
};
