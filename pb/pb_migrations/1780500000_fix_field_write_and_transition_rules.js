// pb_migrations/1780500000_fix_field_write_and_transition_rules.js
//
// Fix a regression introduced when workflow_stages.visible_to_roles was removed
// (1779000000 unified field-defs + 1779700000 data-tab-layout). Those migrations
// rerouted two *action* gates onto workflow.entry_allowed_roles:
//   - workflow_field_values create/update  (writing field values)
//   - workflow_instances.updateRule         (stage transitions)
//
// Consequence: only roles allowed to CREATE an instance could also TRANSITION it
// or WRITE its field values. A role meant to act on a later stage (e.g. a Prüfer
// working a Mangel that someone else reported) could neither advance the instance
// nor save data — and the entry_allowed_roles multi-relation check threw
// "sql: no rows in result set" instead of cleanly denying.
//
// Why not gate on connections/forms via @collection back-relations? Those are
// reverse lookups into other collections; PocketBase evaluates them unreliably
// (the same sql:no-rows class of error). Forward relations the record already
// holds are robust. So:
//
//   workflow_field_values  -> gate WRITES exactly like READS: field_def_id.view_roles
//                             (forward relation; empty = all roles). Symmetric with
//                             the existing list/view rule.
//   workflow_instances     -> updateRule = any participant in the project
//                             (transparency model). Which transitions are *offered*
//                             is still gated by connection.allowed_roles (a clean
//                             forward check in the connections list rule), so the
//                             participant UI never surfaces a transition the role
//                             may not trigger. createRule stays on entry_allowed_roles
//                             (creating an instance == entry permission — unchanged).

migrate((app) => {
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`;

  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`;

  // ---- workflow_field_values: write gate == read gate (field_def_id.view_roles) ----
  const fv = app.findCollectionByNameOrId("workflow_field_values");
  if (fv) {
    const writeRule = `instance_id.workflow_id.project_id.owner_id = @request.auth.id || (
      ${participantInProject("instance_id.workflow_id.project_id")}
      && instance_id.status != "deleted"
      && instance_id.status != "archived"
      && ${roleCheck("field_def_id.view_roles")}
    )`;
    fv.createRule = writeRule;
    fv.updateRule = writeRule;
    app.save(fv);
  }

  // ---- workflow_instances: transitions open to any project participant ----
  const inst = app.findCollectionByNameOrId("workflow_instances");
  if (inst) {
    inst.updateRule = `workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("workflow_id.project_id")}`;
    app.save(inst);
  }
}, (app) => {
  // DOWN — restore the entry_allowed_roles-based gates (pre-fix state).
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`;
  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`;

  const fv = app.findCollectionByNameOrId("workflow_field_values");
  if (fv) {
    const entryRule = `instance_id.workflow_id.project_id.owner_id = @request.auth.id || (
      ${participantInProject("instance_id.workflow_id.project_id")}
      && ${roleCheck("instance_id.workflow_id.entry_allowed_roles")}
    )`;
    fv.createRule = entryRule;
    fv.updateRule = entryRule;
    app.save(fv);
  }

  const inst = app.findCollectionByNameOrId("workflow_instances");
  if (inst) {
    inst.updateRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("workflow_id.entry_allowed_roles")})`;
    app.save(inst);
  }
});
