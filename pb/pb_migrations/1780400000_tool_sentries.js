// pb_migrations/1780400000_tool_sentries.js
//
// Sentries on tools — extends the CMMN sentry idea (added to connections in
// 1779200000_connection_sentries.js) to the three tool collections.
//
// Adds a `sentry` JSON column on tools_forms, tools_edit and tools_protocol.
// Same shape as connection sentries — an array of AND-ed clauses:
//
//   [
//     { field_def_id: "<id>", op: "equals" | "not_equals" | "contains" |
//                              "is_empty" | "is_not_empty" |
//                              "gt" | "gte" | "lt" | "lte", value: "..." },
//     ...
//   ]
//
// Empty/missing sentry = always available (today's behavior). Evaluation is
// client-side, on top of the existing scope (global/stage/connection) and role
// gating — the participant module hides any tool whose sentry doesn't match the
// instance's current field values.
//
// Why JSON (not a separate table): identical reasoning to connection sentries —
// few clauses per tool, no sharing across tools; easy to promote later.

const TOOL_COLLECTIONS = ["tools_forms", "tools_edit", "tools_protocol"];

migrate((app) => {
  for (const name of TOOL_COLLECTIONS) {
    const col = app.findCollectionByNameOrId(name);
    if (!col) throw new Error(`${name} collection missing`);
    if (!col.fields.find((f) => f.name === "sentry")) {
      col.fields.add(new Field({
        name: "sentry",
        type: "json",
      }));
      app.save(col);
    }
  }
}, (app) => {
  for (const name of TOOL_COLLECTIONS) {
    const col = app.findCollectionByNameOrId(name);
    if (!col) continue;
    const idx = col.fields.findIndex((f) => f.name === "sentry");
    if (idx >= 0) {
      col.fields.splice(idx, 1);
      app.save(col);
    }
  }
});
