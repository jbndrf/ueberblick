import * as m from '$lib/paraglide/messages';
import { formatDistanceToNow } from 'date-fns';
import type { BaseColumnConfig } from '$lib/components/admin/base-table';

export type MarkerCategory = {
	id: string;
	project_id: string;
	name: string;
	description: string | null;
	icon_config: Record<string, any> | null;
	visible_to_roles: string[] | null;
	fields: Record<string, any>[] | null;
	created: string;
};

export function getMarkerCategoryColumns(options: {
	roles: any[];
	iconCellRenderer: (params: { value: any }) => any;
	onUpdateName: (rowId: string, value: string) => Promise<void>;
	onUpdateDescription: (rowId: string, value: string) => Promise<void>;
	onUpdateRoles: (rowId: string, value: string[]) => Promise<void>;
	onCreateRole: (name: string) => Promise<any>;
}): BaseColumnConfig<MarkerCategory>[] {
	return [
		{
			id: 'icon_preview',
			header: m.markerCategoriesIcon?.() ?? 'Icon',
			accessorFn: (row) => row.icon_config,
			cellRenderer: options.iconCellRenderer,
			fieldType: 'text',
			capabilities: {
				editable: false,
				sortable: false,
				filterable: false
			}
		},
		{
			id: 'name',
			header: m.markerCategoriesName?.() ?? 'Name',
			accessorKey: 'name',
			fieldType: 'text',
			capabilities: {
				editable: true,
				sortable: true,
				filterable: true
			},
			onUpdate: options.onUpdateName
		},
		{
			id: 'description',
			header: m.rolesDescription_field(),
			accessorKey: 'description',
			fieldType: 'text',
			capabilities: {
				editable: true,
				sortable: true,
				filterable: true
			},
			onUpdate: options.onUpdateDescription
		},
		{
			id: 'visible_to_roles',
			header: m.mapLayerVisibleToRoles?.() ?? 'Visible to Roles',
			accessorFn: (row) => {
				if (!row.visible_to_roles || row.visible_to_roles.length === 0) return [];
				return row.visible_to_roles;
			},
			fieldType: 'array',
			capabilities: {
				editable: true,
				sortable: false,
				filterable: true
			},
			entityConfig: {
				getEntityId: (role) => role.id,
				getEntityName: (role) => role.name,
				getEntityDescription: (role) => role.description,
				availableEntities: options.roles,
				allowCreate: true,
				onCreateEntity: options.onCreateRole
			},
			onUpdate: options.onUpdateRoles
		},
		{
			id: 'created',
			header: m.customTablesCreated(),
			accessorFn: (row) => {
				try {
					const date = new Date(row.created);
					if (isNaN(date.getTime())) return '-';
					return formatDistanceToNow(date, { addSuffix: true });
				} catch {
					return '-';
				}
			},
			fieldType: 'text',
			capabilities: {
				editable: false,
				sortable: true,
				filterable: false
			}
		}
	];
}
