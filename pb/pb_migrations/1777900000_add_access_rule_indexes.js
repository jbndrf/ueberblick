// Indexes on FK columns that the workflow_instance_field_values (and sibling)
// access rules JOIN on when evaluating owner / participant / role branches.
// Without these, every read against the protected collections does full scans
// on projects.owner_id, participants.project_id, participants.role_id and
// roles.project_id -- which dominates admin page load time once there are more
// than a few thousand participants or field-value rows.
//
// Indexes don't change rule semantics; they only make the JOINs the rule
// already performs a B-tree seek instead of a scan.

migrate((app) => {
	const additions = [
		{
			collection: 'projects',
			indexes: ['CREATE INDEX `idx_projects_owner_id` ON `projects` (`owner_id`)']
		},
		{
			collection: 'participants',
			indexes: [
				'CREATE INDEX `idx_participants_project_id` ON `participants` (`project_id`)',
				'CREATE INDEX `idx_participants_role_id` ON `participants` (`role_id`)'
			]
		},
		{
			collection: 'roles',
			indexes: ['CREATE INDEX `idx_roles_project_id` ON `roles` (`project_id`)']
		}
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
		projects: ['idx_projects_owner_id'],
		participants: ['idx_participants_project_id', 'idx_participants_role_id'],
		roles: ['idx_roles_project_id']
	};

	for (const [name, names] of Object.entries(removals)) {
		try {
			const col = app.findCollectionByNameOrId(name);
			col.indexes = (col.indexes || []).filter((sql) => {
				return !names.some((idxName) => sql.includes('`' + idxName + '`'));
			});
			app.save(col);
		} catch (e) {
			// Collection may not exist on downgrade -- skip
		}
	}
});
