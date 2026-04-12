// Add indexes on hot columns used by the admin workflow page and sidebar.
// Access rules on workflow_instances / workflow_instance_field_values JOIN through
// workflow_id -> project_id, and the admin list queries filter + sort on these
// columns. Without indexes every query is a full table scan, which dominates
// load time once a workflow has a few thousand instances.
//
// Indexes don't change rule evaluation -- they only speed up the lookups that
// the WHERE clause already performs. No access semantics change.

migrate((app) => {
	const additions = [
		{
			collection: "workflow_instance_field_values",
			indexes: [
				"CREATE INDEX `idx_wifv_instance_id` ON `workflow_instance_field_values` (`instance_id`)",
				"CREATE INDEX `idx_wifv_stage_id` ON `workflow_instance_field_values` (`stage_id`)",
			],
		},
		{
			collection: "workflow_instances",
			indexes: [
				// Composite: covers both "filter by workflow" and "sort by created desc" in one index
				"CREATE INDEX `idx_wi_workflow_created` ON `workflow_instances` (`workflow_id`, `created` DESC)",
				"CREATE INDEX `idx_wi_created_by` ON `workflow_instances` (`created_by`)",
			],
		},
		{
			collection: "workflows",
			indexes: [
				"CREATE INDEX `idx_workflows_project_id` ON `workflows` (`project_id`)",
			],
		},
		{
			collection: "custom_tables",
			indexes: [
				"CREATE INDEX `idx_custom_tables_project_id` ON `custom_tables` (`project_id`)",
			],
		},
		{
			collection: "marker_categories",
			indexes: [
				"CREATE INDEX `idx_marker_categories_project_id` ON `marker_categories` (`project_id`)",
			],
		},
		{
			collection: "tools_forms",
			indexes: [
				"CREATE INDEX `idx_tools_forms_workflow_id` ON `tools_forms` (`workflow_id`)",
			],
		},
		{
			collection: "tools_form_fields",
			indexes: [
				"CREATE INDEX `idx_tools_form_fields_form_id` ON `tools_form_fields` (`form_id`)",
			],
		},
		{
			collection: "workflow_stages",
			indexes: [
				"CREATE INDEX `idx_workflow_stages_workflow_id` ON `workflow_stages` (`workflow_id`)",
			],
		},
	];

	for (const { collection: name, indexes } of additions) {
		const col = app.findCollectionByNameOrId(name);
		const existing = new Set(col.indexes || []);
		for (const idx of indexes) {
			if (!existing.has(idx)) {
				col.indexes.push(idx);
			}
		}
		app.save(col);
	}
}, (app) => {
	const removals = {
		workflow_instance_field_values: ["idx_wifv_instance_id", "idx_wifv_stage_id"],
		workflow_instances: ["idx_wi_workflow_created", "idx_wi_created_by"],
		workflows: ["idx_workflows_project_id"],
		custom_tables: ["idx_custom_tables_project_id"],
		marker_categories: ["idx_marker_categories_project_id"],
		tools_forms: ["idx_tools_forms_workflow_id"],
		tools_form_fields: ["idx_tools_form_fields_form_id"],
		workflow_stages: ["idx_workflow_stages_workflow_id"],
	};

	for (const [name, names] of Object.entries(removals)) {
		try {
			const col = app.findCollectionByNameOrId(name);
			col.indexes = (col.indexes || []).filter((sql) => {
				return !names.some((idxName) => sql.includes("`" + idxName + "`"));
			});
			app.save(col);
		} catch (e) {
			// Collection may not exist on downgrade -- skip
		}
	}
});
