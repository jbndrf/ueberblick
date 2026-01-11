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
