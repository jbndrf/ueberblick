// pb_migrations/1779200000_connection_sentries.js
//
// Phase 3 of the workflow field redesign — conditional connections (CMMN sentries).
//
// Adds a `sentry` JSON column on workflow_connections. The shape is an array
// of clauses, all AND-ed together:
//
//   [
//     { field_def_id: "<id>", op: "equals" | "not_equals" | "contains" |
//                              "is_empty" | "is_not_empty" |
//                              "gt" | "gte" | "lt" | "lte", value: "..." },
//     ...
//   ]
//
// Empty/missing sentry = always available (today's behavior).
//
// Evaluation is client-side: the participant module reads the instance's
// current field values (already in the offline cache) and hides any
// connection whose sentry doesn't match. No new server hook needed for
// gating — when the participant taps a visible connection, the existing
// transition write proceeds normally. The connection.allowed_roles role
// gate still applies on top.
//
// Why JSON (not a separate sentry_parts table): at the scale we expect
// (few clauses per connection, no shared sentries across connections),
// the join overhead and admin UX of managing rows isn't worth it. Easy to
// promote to a relation later if it becomes a constraint.

migrate((app) => {
  const connections = app.findCollectionByNameOrId("workflow_connections");
  if (!connections) throw new Error("workflow_connections collection missing");

  if (!connections.fields.find((f) => f.name === "sentry")) {
    connections.fields.add(new Field({
      name: "sentry",
      type: "json",
    }));
    app.save(connections);
  }
}, (app) => {
  const connections = app.findCollectionByNameOrId("workflow_connections");
  if (connections) {
    const idx = connections.fields.findIndex((f) => f.name === "sentry");
    if (idx >= 0) {
      connections.fields.splice(idx, 1);
      app.save(connections);
    }
  }
});
