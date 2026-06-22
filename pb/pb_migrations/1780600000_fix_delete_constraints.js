/// <reference path="../pb_data/types.d.ts" />

// Migration: fix records that cannot be reliably deleted.
//
// Two independent regressions left required relations with no cascade rule,
// which makes PocketBase refuse to delete the parent record:
//
//  1. tools_edit was dropped & recreated in 1779800000 without re-applying the
//     cascadeDelete flags that 1777600000 had set. So `workflow_id` (required,
//     no cascade) blocks deleting any workflow — and therefore any project that
//     contains it — and `connection_id` silently orphans edit tools on
//     connection delete. Restore both flags: deleting a workflow/connection
//     removes its edit tools (correct ownership).
//
//  2. workflow_field_values.recorded_at_stage (1779000000) is required with no
//     cascade. Data presentation is no longer stage-derived (1779700000) —
//     tabs are emergent from each field def's display_config — so this column
//     is audit-only. But `required: true` blocks deleting any stage that has
//     recorded data. Make it optional and keep cascadeDelete=false so deleting
//     a stage simply nulls the audit stamp and PRESERVES the field values
//     (they stay in whatever data tab their field def dictates).

migrate((app) => {
  // 1) tools_edit ownership relations -> cascade delete.
  const edit = app.findCollectionByNameOrId("tools_edit");
  for (const name of ["workflow_id", "connection_id"]) {
    const f = edit.fields.getByName(name);
    if (!f) throw new Error(`tools_edit.${name} not found`);
    f.cascadeDelete = true;
  }
  app.save(edit);

  // 2) recorded_at_stage -> optional, non-cascade (preserve data on stage delete).
  const fv = app.findCollectionByNameOrId("workflow_field_values");
  const stage = fv.fields.getByName("recorded_at_stage");
  if (!stage) throw new Error("workflow_field_values.recorded_at_stage not found");
  stage.required = false;
  stage.cascadeDelete = false;
  app.save(fv);
}, (app) => {
  const edit = app.findCollectionByNameOrId("tools_edit");
  for (const name of ["workflow_id", "connection_id"]) {
    const f = edit.fields.getByName(name);
    if (f) f.cascadeDelete = false;
  }
  app.save(edit);

  const fv = app.findCollectionByNameOrId("workflow_field_values");
  const stage = fv.fields.getByName("recorded_at_stage");
  if (stage) stage.required = true;
  app.save(fv);
});
