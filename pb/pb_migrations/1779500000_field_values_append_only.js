// pb_migrations/1779500000_field_values_append_only.js
//
// Flip workflow_field_values to a fully append-only event log.
// See /home/jan/.claude/plans/this-is-not-what-golden-wilkes.md.
//
// Changes:
//   - DROP partial unique index `idx_field_values_singleton`.
//     All write_modes (singleton, observation, computed) now append.
//     "Current value" = ORDER BY recorded_at DESC LIMIT 1 per (instance, field_def).
//   - The remaining `idx_field_values_obs_history` (instance_id, field_def_id, recorded_at DESC)
//     already supports both "latest per field" and "last N per field" reads.
//
// write_mode stays as a UI/semantic discriminator only; it no longer constrains storage.
// Field-level access (workflow_field_defs.view_roles) is already enforced by the existing
// list/view rules — every audit-trail UI gets leak-prevention for free.

migrate((app) => {
  const fieldValues = app.findCollectionByNameOrId("workflow_field_values");
  if (!fieldValues) return;

  fieldValues.indexes = fieldValues.indexes.filter(
    (idx) => !idx.includes("idx_field_values_singleton"),
  );
  app.save(fieldValues);
}, (app) => {
  // DOWN — reinstate the partial unique index. Note: if existing data has
  // multiple rows per (instance, field_def) for singleton/computed write_modes,
  // recreating this index will fail. Use `npm run db:clear` as the rollback.
  const fieldValues = app.findCollectionByNameOrId("workflow_field_values");
  if (!fieldValues) return;

  const singletonIdx =
    "CREATE UNIQUE INDEX `idx_field_values_singleton` ON `workflow_field_values` (`instance_id`, `field_def_id`) WHERE `write_mode` = 'singleton' OR `write_mode` = 'computed'";
  if (!fieldValues.indexes.includes(singletonIdx)) {
    fieldValues.indexes.push(singletonIdx);
  }
  app.save(fieldValues);
});
