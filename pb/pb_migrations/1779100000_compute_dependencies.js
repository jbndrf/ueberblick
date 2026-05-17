// pb_migrations/1779100000_compute_dependencies.js
//
// Phase 2 of the workflow field redesign — first-class computed fields.
//
// Adds `compute_depends_on` (multi-relation -> workflow_field_defs) on
// workflow_field_defs. The admin save layer populates it by parsing
// `compute_expression` and resolving every `{field_key}` reference to its
// field def id. The server-side recompute hook (computed_fields.js) uses
// this column as a forward index: "when value of field X changes, recompute
// every def that depends on X".
//
// Also adds a small `workflow_field_compute_log` collection for debugging
// recompute failures (optional but invaluable when "why is this empty?"
// shows up in support).

migrate((app) => {
  const fieldDefs = app.findCollectionByNameOrId("workflow_field_defs");
  if (!fieldDefs) throw new Error("workflow_field_defs collection missing — run 1779000000 first");

  if (!fieldDefs.fields.find((f) => f.name === "compute_depends_on")) {
    fieldDefs.fields.add(new Field({
      name: "compute_depends_on",
      type: "relation",
      collectionId: fieldDefs.id,
      maxSelect: 99,
    }));
    app.save(fieldDefs);
  }

  // Optional debug log — non-blocking; if recompute throws, append a row.
  // Admin-only (null rules = only accessible via PB admin UI / hooks).
  var existingLog = null;
  try { existingLog = app.findCollectionByNameOrId("workflow_field_compute_log"); } catch (e) { /* doesn't exist yet */ }
  if (!existingLog) {
    const workflowInstancesId = app.findCollectionByNameOrId("workflow_instances").id;
    const log = new Collection({
      type: "base",
      name: "workflow_field_compute_log",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "instance_id", type: "relation", required: true, collectionId: workflowInstancesId, maxSelect: 1, cascadeDelete: true },
        { name: "field_def_id", type: "relation", required: true, collectionId: fieldDefs.id, maxSelect: 1, cascadeDelete: true },
        { name: "expression", type: "text", max: 2000 },
        { name: "result", type: "text" },
        { name: "error", type: "text", max: 2000 },
        { name: "computed_at", type: "date", required: true },
      ],
      indexes: [
        "CREATE INDEX `idx_compute_log_instance` ON `workflow_field_compute_log` (`instance_id`, `computed_at` DESC)",
      ],
    });
    app.save(log);
  }
}, (app) => {
  // DOWN
  try { app.delete(app.findCollectionByNameOrId("workflow_field_compute_log")); } catch (e) {}

  const fieldDefs = app.findCollectionByNameOrId("workflow_field_defs");
  if (fieldDefs) {
    const idx = fieldDefs.fields.findIndex((f) => f.name === "compute_depends_on");
    if (idx >= 0) {
      fieldDefs.fields.splice(idx, 1);
      app.save(fieldDefs);
    }
  }
});
