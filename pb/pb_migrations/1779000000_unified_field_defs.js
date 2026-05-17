// pb_migrations/1779000000_unified_field_defs.js
//
// Phase 1 of the workflow field redesign — unified field-def model.
// See /home/jan/.claude/plans/im-not-happy-with-keen-sundae.md for full context.
//
// Changes:
//   - NEW workflow_field_defs       — workflow-scoped field definitions (the registry)
//   - NEW workflow_field_values     — unified storage with partial unique index on singletons
//   - NEW tools_form_field_refs     — replaces tools_form_fields; forms reference field defs
//   - DROP tools_form_fields        — definitional columns moved to workflow_field_defs
//   - DROP tools_edit               — a form referencing existing field defs IS the edit affordance
//   - DROP workflow_instance_field_values — replaced by workflow_field_values
//   - UPDATE tools_protocol          — drop editable_fields (semantics moved to write_mode);
//                                     add protocol_only_field_defs
//   - UPDATE workflow_protocol_entries — drop field_values JSON (writes go through workflow_field_values)
//
// Wipe is acceptable per CLAUDE.md (pre-release; no backwards compat).

migrate((app) => {
  const workflowsId = app.findCollectionByNameOrId("workflows").id;
  const workflowStagesId = app.findCollectionByNameOrId("workflow_stages").id;
  const workflowInstancesId = app.findCollectionByNameOrId("workflow_instances").id;
  const workflowToolUsageId = app.findCollectionByNameOrId("workflow_instance_tool_usage").id;
  const rolesId = app.findCollectionByNameOrId("roles").id;

  // ---------- helpers (mirrors 1768800001 conventions) ----------
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`;

  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`;

  // ============================================================================
  // 1) Drop the old collections (DB wipeable; no data migration)
  //    Order matters: drop things that reference others first.
  // ============================================================================

  // workflow_protocol_entries.field_values JSON is dropped via update (collection stays)
  // tools_protocol.editable_fields relation must be dropped before tools_form_fields goes away
  const oldProtocol = app.findCollectionByNameOrId("tools_protocol");
  if (oldProtocol) {
    const editableIdx = oldProtocol.fields.findIndex((f) => f.name === "editable_fields");
    if (editableIdx >= 0) oldProtocol.fields.splice(editableIdx, 1);
    app.save(oldProtocol);
  }

  // Drop tools_edit (entirely replaced by form-with-existing-fields)
  try { app.delete(app.findCollectionByNameOrId("tools_edit")); } catch (e) {}

  // Drop workflow_instance_field_values (replaced by workflow_field_values)
  try { app.delete(app.findCollectionByNameOrId("workflow_instance_field_values")); } catch (e) {}

  // Drop tools_form_fields (replaced by workflow_field_defs + tools_form_field_refs)
  try { app.delete(app.findCollectionByNameOrId("tools_form_fields")); } catch (e) {}

  // ============================================================================
  // 2) workflow_field_defs — the workflow-scoped field registry
  // ============================================================================

  const fieldDefs = new Collection({
    type: "base",
    name: "workflow_field_defs",
    // Read: admin or any participant in the project (field defs are structural,
    // like stages/connections). Per-field VALUE visibility lives on workflow_field_values
    // via field_def_id.view_roles.
    listRule: `workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("workflow_id.project_id")}`,
    viewRule: `workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("workflow_id.project_id")}`,
    createRule: `workflow_id.project_id.owner_id = @request.auth.id`,
    updateRule: `workflow_id.project_id.owner_id = @request.auth.id`,
    deleteRule: `workflow_id.project_id.owner_id = @request.auth.id`,
    fields: [
      { name: "workflow_id", type: "relation", required: true, collectionId: workflowsId, maxSelect: 1, cascadeDelete: true },
      { name: "key", type: "text", required: true, max: 255 },
      { name: "label", type: "text", required: true, max: 255 },
      {
        name: "field_type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: [
          "short_text", "long_text", "number", "email", "date", "file",
          "dropdown", "multiple_choice", "smart_dropdown", "custom_table_selector",
        ],
      },
      {
        name: "write_mode",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["singleton", "observation", "computed"],
      },
      {
        name: "output_type",
        type: "select",
        maxSelect: 1,
        values: ["text", "number", "date", "json"],
      },
      // Where this field renders on the stage-tab read view.
      // null/empty = derive from the (sole) form that references it.
      { name: "display_stage_id", type: "relation", collectionId: workflowStagesId, maxSelect: 1 },
      // Optional per-field visibility override. null/empty = inherit from the form's allowed_roles.
      { name: "view_roles", type: "relation", collectionId: rolesId, maxSelect: 99 },
      // Default-value semantics for the form renderer.
      { name: "placeholder", type: "text", max: 255 },
      { name: "help_text", type: "text", max: 1000 },
      { name: "is_required", type: "bool" },
      { name: "validation_rules", type: "json" },
      { name: "field_options", type: "json" },
      // Phase 2: computed only. Stored in Phase 1 so admin UI can already accept it.
      { name: "compute_expression", type: "text", max: 2000 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_field_defs_workflow_key` ON `workflow_field_defs` (`workflow_id`, `key`)",
      "CREATE INDEX `idx_field_defs_workflow_id` ON `workflow_field_defs` (`workflow_id`)",
      "CREATE INDEX `idx_field_defs_display_stage_id` ON `workflow_field_defs` (`display_stage_id`)",
    ],
  });
  app.save(fieldDefs);

  // ============================================================================
  // 3) workflow_field_values — unified storage (singleton + observation + computed)
  // ============================================================================

  // Read rule honors:
  //   - admin (owner of the project), OR
  //   - participant in project AND can see the stage where this value was recorded, AND
  //   - if field_def has view_roles set, the participant's role must be in that set
  //     (when view_roles is empty/null, fall back to stage gate only)
  //
  // Status filter on participant branch — drop deleted/archived from view.
  const valueParticipantRead = `
    ${participantInProject("instance_id.workflow_id.project_id")}
    && instance_id.status != "deleted"
    && instance_id.status != "archived"
    && ${roleCheck("recorded_at_stage.visible_to_roles")}
    && ${roleCheck("field_def_id.view_roles")}
  `;

  const valueParticipantWrite = `
    ${participantInProject("instance_id.workflow_id.project_id")}
    && (
      ${roleCheck("instance_id.current_stage_id.visible_to_roles")}
      || ${roleCheck("instance_id.workflow_id.entry_allowed_roles")}
    )
  `;

  const fieldValues = new Collection({
    type: "base",
    name: "workflow_field_values",
    listRule: `instance_id.workflow_id.project_id.owner_id = @request.auth.id || (${valueParticipantRead})`,
    viewRule: `instance_id.workflow_id.project_id.owner_id = @request.auth.id || (${valueParticipantRead})`,
    createRule: `instance_id.workflow_id.project_id.owner_id = @request.auth.id || (${valueParticipantWrite})`,
    updateRule: `instance_id.workflow_id.project_id.owner_id = @request.auth.id || (${valueParticipantWrite})`,
    deleteRule: `instance_id.workflow_id.project_id.owner_id = @request.auth.id`,
    fields: [
      { name: "instance_id", type: "relation", required: true, collectionId: workflowInstancesId, maxSelect: 1, cascadeDelete: true },
      { name: "field_def_id", type: "relation", required: true, collectionId: fieldDefs.id, maxSelect: 1, cascadeDelete: true },
      // Denormalized from field_def.write_mode — required for the partial unique index
      // ("singleton" rows must be unique per (instance, field_def); observations append).
      {
        name: "write_mode",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["singleton", "observation", "computed"],
      },
      { name: "value", type: "text" },
      {
        name: "file_value",
        type: "file",
        maxSelect: 1,
        maxSize: 10485760,
        // Mirror the mime allowlist from 1777100000 — only images for participant uploads.
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
      },
      { name: "recorded_at", type: "date", required: true },
      { name: "recorded_by_action", type: "relation", collectionId: workflowToolUsageId, maxSelect: 1 },
      { name: "recorded_at_stage", type: "relation", required: true, collectionId: workflowStagesId, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      // The bug fix: singletons are unique per (instance, field_def). Observations append (no constraint).
      "CREATE UNIQUE INDEX `idx_field_values_singleton` ON `workflow_field_values` (`instance_id`, `field_def_id`) WHERE `write_mode` = 'singleton' OR `write_mode` = 'computed'",
      "CREATE INDEX `idx_field_values_instance` ON `workflow_field_values` (`instance_id`)",
      "CREATE INDEX `idx_field_values_obs_history` ON `workflow_field_values` (`instance_id`, `field_def_id`, `recorded_at` DESC)",
      "CREATE INDEX `idx_field_values_stage` ON `workflow_field_values` (`recorded_at_stage`)",
    ],
  });
  app.save(fieldValues);

  // ============================================================================
  // 4) tools_form_field_refs — replaces tools_form_fields
  //    Forms now reference field defs from the workflow's registry; per-form
  //    layout + label overrides live here, not the definitional bits.
  // ============================================================================

  const formsId = app.findCollectionByNameOrId("tools_forms").id;

  const formFieldRefs = new Collection({
    type: "base",
    name: "tools_form_field_refs",
    // Inherits parent form's read scope (same pattern as old tools_form_fields).
    listRule: `form_id.workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("form_id.workflow_id.project_id")}`,
    viewRule: `form_id.workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("form_id.workflow_id.project_id")}`,
    createRule: `form_id.workflow_id.project_id.owner_id = @request.auth.id`,
    updateRule: `form_id.workflow_id.project_id.owner_id = @request.auth.id`,
    deleteRule: `form_id.workflow_id.project_id.owner_id = @request.auth.id`,
    fields: [
      { name: "form_id", type: "relation", required: true, collectionId: formsId, maxSelect: 1, cascadeDelete: true },
      { name: "field_def_id", type: "relation", required: true, collectionId: fieldDefs.id, maxSelect: 1, cascadeDelete: true },
      { name: "field_order", type: "number", min: 0 },
      { name: "page", type: "number", min: 1 },
      { name: "page_title", type: "text", max: 255 },
      { name: "row_index", type: "number", min: 0 },
      { name: "column_position", type: "number", min: 0 },
      // Per-form overrides (null/empty = use field def's defaults).
      { name: "is_required_override", type: "bool" },
      { name: "placeholder_override", type: "text", max: 255 },
      { name: "help_text_override", type: "text", max: 1000 },
      { name: "conditional_logic", type: "json" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX `idx_form_field_refs_form_id` ON `tools_form_field_refs` (`form_id`)",
      "CREATE INDEX `idx_form_field_refs_field_def_id` ON `tools_form_field_refs` (`field_def_id`)",
      "CREATE UNIQUE INDEX `idx_form_field_refs_unique` ON `tools_form_field_refs` (`form_id`, `field_def_id`)",
    ],
  });
  app.save(formFieldRefs);

  // ============================================================================
  // 5) tools_protocol — add protocol_only_field_defs (extra fields that go
  //    only into the snapshot JSON, never into workflow_field_values)
  // ============================================================================

  const protocol = app.findCollectionByNameOrId("tools_protocol");
  if (protocol) {
    // Add protocol_only_field_defs if not already present
    if (!protocol.fields.find((f) => f.name === "protocol_only_field_defs")) {
      protocol.fields.add(new Field({
        name: "protocol_only_field_defs",
        type: "relation",
        collectionId: fieldDefs.id,
        maxSelect: 99,
      }));
    }
    app.save(protocol);
  }

  // ============================================================================
  // 6) workflow_protocol_entries — drop field_values JSON
  //    (writes now go through workflow_field_values via field def write_mode)
  // ============================================================================

  const protocolEntries = app.findCollectionByNameOrId("workflow_protocol_entries");
  if (protocolEntries) {
    const fvIdx = protocolEntries.fields.findIndex((f) => f.name === "field_values");
    if (fvIdx >= 0) {
      protocolEntries.fields.splice(fvIdx, 1);
      app.save(protocolEntries);
    }
  }
}, (app) => {
  // DOWN — best-effort undo. The pre-migration shape had a lot of historical
  // accretion (10+ migrations touched these tables); we restore the minimum to
  // let pre-1779 code paths function. DB-wipe is the recommended rollback.

  try { app.delete(app.findCollectionByNameOrId("tools_form_field_refs")); } catch (e) {}
  try { app.delete(app.findCollectionByNameOrId("workflow_field_values")); } catch (e) {}
  try { app.delete(app.findCollectionByNameOrId("workflow_field_defs")); } catch (e) {}

  // Strip the additions from tools_protocol / workflow_protocol_entries.
  const protocol = app.findCollectionByNameOrId("tools_protocol");
  if (protocol) {
    const idx = protocol.fields.findIndex((f) => f.name === "protocol_only_field_defs");
    if (idx >= 0) {
      protocol.fields.splice(idx, 1);
      app.save(protocol);
    }
  }

  // Note: we don't recreate tools_edit / tools_form_fields / workflow_instance_field_values
  // here — too much accreted state. Use `npm run db:clear` and replay migrations from 0.
});
