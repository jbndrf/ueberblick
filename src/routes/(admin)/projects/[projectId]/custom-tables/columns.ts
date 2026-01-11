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
