// pb_migrations/1779300000_instance_reference.js
//
// Phase 4 of the workflow field redesign — instance references (XState-actor /
// CMMN sub-case style).
//
// Extends the `field_type` enum on workflow_field_defs to include a new value
// `instance_reference`. A field of this type stores one or many
// workflow_instance ids in the `value` column (JSON-encoded array). The
// `field_options` JSON column carries the relationship metadata:
//
//   {
//     target_workflow_id: string | null,   // null = any workflow
//     multiplicity: 'single' | 'many',     // default 'single'
//     on_delete: 'cascade' | 'nullify' | 'block',  // default 'nullify'
//     relation_kind: 'peer' | 'parent' | 'child'   // default 'peer'
//   }
//
// Foundation-only this pass: the value column already accepts JSON; no
// storage migration needed. The following bits are deferred to follow-up
// migrations because each is non-trivial and benefits from being scoped to
// an actual use case:
//
//   - Expression-engine dot-syntax (`{ref_field.target_field}` and
//     `count({multi_ref}, ...)`-style aggregates).
//   - Transitive offline sync (pulling referenced instances when their
//     parent is pulled).
//   - Cascade-on-delete server enforcement (the `on_delete` value is
//     recorded but not yet honored).
//
// The client-side participant UI for selecting / displaying an instance
// reference is also deferred; today the value can be set programmatically
// or via raw JSON in the admin tools.

migrate((app) => {
  const fieldDefs = app.findCollectionByNameOrId("workflow_field_defs");
  if (!fieldDefs) throw new Error("workflow_field_defs collection missing — run 1779000000 first");

  const ft = fieldDefs.fields.find((f) => f.name === "field_type");
  if (!ft) throw new Error("workflow_field_defs.field_type not found");

  if (!ft.values.includes("instance_reference")) {
    ft.values.push("instance_reference");
    app.save(fieldDefs);
  }
}, (app) => {
  const fieldDefs = app.findCollectionByNameOrId("workflow_field_defs");
  if (!fieldDefs) return;
  const ft = fieldDefs.fields.find((f) => f.name === "field_type");
  if (!ft) return;
  const idx = ft.values.indexOf("instance_reference");
  if (idx >= 0) {
    ft.values.splice(idx, 1);
    app.save(fieldDefs);
  }
});
