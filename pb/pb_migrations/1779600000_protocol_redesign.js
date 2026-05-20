// pb_migrations/1779600000_protocol_redesign.js
//
// Protocol tool — final alignment with the unified field-def model.
// See /home/jan/.claude/plans/peppy-finding-salamander.md for context.
//
// Changes:
//   - ADD tools_forms.local_fields (JSON) — inline protocol-local field defs
//     that live ONLY on a form (no workflow_field_defs entry). Their values
//     go only into workflow_protocol_entries.snapshot.
//   - DROP tools_protocol.protocol_only_field_defs — replaced by per-form
//     local_fields.
//   - DELETE workflow_field_defs rows that were only referenced by
//     protocol_only_field_defs (orphan cleanup; CLAUDE.md: no backwards compat).
//   - Note: workflow_protocol_entries.snapshot shape is formalized in app code,
//     not at the schema level (PocketBase JSON column stays untyped).

migrate((app) => {
  // ---------- 1) tools_forms.local_fields ----------
  const forms = app.findCollectionByNameOrId("tools_forms");
  if (forms && !forms.fields.find((f) => f.name === "local_fields")) {
    forms.fields.add(new Field({ name: "local_fields", type: "json" }));
    app.save(forms);
  }

  // ---------- 2) Orphan cleanup BEFORE dropping the relation ----------
  // Collect field_def ids that appear in any protocol_only_field_defs but in
  // zero tools_form_field_refs. Those are protocol-only library defs that lose
  // all reason to exist after this migration; delete them.
  const protocol = app.findCollectionByNameOrId("tools_protocol");
  const fieldDefs = app.findCollectionByNameOrId("workflow_field_defs");

  if (protocol && fieldDefs) {
    const protoCol = protocol;
    const protocolRows = app.findRecordsByFilter(protoCol.id, "", "", 0, 0);
    const usedAsProtocolOnly = new Set();
    for (const r of protocolRows) {
      const ids = r.get("protocol_only_field_defs");
      if (Array.isArray(ids)) for (const id of ids) usedAsProtocolOnly.add(id);
    }

    const formFieldRefs = app.findCollectionByNameOrId("tools_form_field_refs");
    if (formFieldRefs && usedAsProtocolOnly.size > 0) {
      for (const defId of usedAsProtocolOnly) {
        // Skip if referenced from any form field ref — keep it.
        const refs = app.findRecordsByFilter(
          formFieldRefs.id,
          `field_def_id = "${defId}"`,
          "",
          1,
          0,
        );
        if (refs.length > 0) continue;
        try {
          const rec = app.findRecordById(fieldDefs.id, defId);
          if (rec) app.delete(rec);
        } catch (e) {
          // Already gone — fine.
        }
      }
    }
  }

  // ---------- 3) Drop tools_protocol.protocol_only_field_defs ----------
  if (protocol) {
    const idx = protocol.fields.findIndex(
      (f) => f.name === "protocol_only_field_defs",
    );
    if (idx >= 0) {
      protocol.fields.splice(idx, 1);
      app.save(protocol);
    }
  }
}, (app) => {
  // DOWN — re-add the dropped relation and the local_fields column removal.
  // No restore of deleted field defs; rollback after destructive cleanup is a
  // db:clear job.
  const forms = app.findCollectionByNameOrId("tools_forms");
  if (forms) {
    const idx = forms.fields.findIndex((f) => f.name === "local_fields");
    if (idx >= 0) {
      forms.fields.splice(idx, 1);
      app.save(forms);
    }
  }

  const protocol = app.findCollectionByNameOrId("tools_protocol");
  const fieldDefs = app.findCollectionByNameOrId("workflow_field_defs");
  if (protocol && fieldDefs && !protocol.fields.find((f) => f.name === "protocol_only_field_defs")) {
    protocol.fields.add(new Field({
      name: "protocol_only_field_defs",
      type: "relation",
      collectionId: fieldDefs.id,
      maxSelect: 99,
    }));
    app.save(protocol);
  }
});
