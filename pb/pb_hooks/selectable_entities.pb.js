/// <reference path="../pb_data/types.d.ts" />

// Custom route for the entity-selector form field, participants source only.
//
// Why only participants: `roles`, `markers`, and `custom_table_data` have
// listRules that already allow participant reads within their project, so
// the frontend queries those collections directly via the offline gateway.
// The `participants` collection, in contrast, restricts each participant to
// their own row — this hook is the single legitimate path for a participant
// to discover other participants by name, gated by the field's
// self_select_roles / any_select_roles configuration.
//
// GET /api/custom/selectable-entities?field_id=<id>
// Auth: authenticated participant.
// Response: { entities: [{ id, label }, ...] } — name only, no email.
// Default is deny: if the caller has no matching role, entities is [].

routerAdd("GET", "/api/custom/selectable-entities", (e) => {
  var helpers = require(`${__hooks}/automation.js`);
  var parseJsonField = helpers.parseJsonField;

  if (!e.auth || e.auth.collection().name !== "participants") {
    return e.json(403, { error: "participant auth required" });
  }

  var fieldId = e.request.url.query().get("field_id");
  if (!fieldId) {
    return e.json(400, { error: "field_id query param required" });
  }

  // Phase-1 redesign: fieldId is a workflow_field_defs.id. The def carries
  // workflow_id directly, so we can resolve project/workflow without walking
  // through a form (a field def may be referenced by many forms, or none).
  var field, workflow;
  try {
    field = $app.findRecordById("workflow_field_defs", fieldId);
    workflow = $app.findRecordById("workflows", field.get("workflow_id"));
  } catch (err) {
    return e.json(404, { error: "field not found" });
  }

  var projectId = workflow.get("project_id");
  if (projectId !== e.auth.get("project_id")) {
    return e.json(403, { error: "cross-project access denied" });
  }

  var opts = parseJsonField(field.get("field_options")) || {};
  if (opts.source_type !== "participants") {
    // Non-participants sources are served directly from the frontend via the
    // offline gateway; this endpoint is not their access path.
    return e.json(200, { entities: [] });
  }

  var myRoles = e.auth.get("role_id") || [];
  if (!Array.isArray(myRoles)) {
    myRoles = [myRoles];
  }
  var authId = e.auth.get("id");

  function intersects(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    for (var i = 0; i < a.length; i++) {
      for (var j = 0; j < b.length; j++) {
        if (a[i] === b[j]) return true;
      }
    }
    return false;
  }

  var selfRoles = opts.self_select_roles || [];
  var anyRoles = opts.any_select_roles || [];
  var canSelf = intersects(myRoles, selfRoles);
  var canAny = intersects(myRoles, anyRoles);

  var entities = [];
  try {
    if (canAny) {
      var participants = $app.findRecordsByFilter(
        "participants",
        "project_id = {:pid}",
        "name",
        0,
        0,
        { pid: projectId }
      );
      for (var p = 0; p < participants.length; p++) {
        var pr = participants[p];
        entities.push({
          id: pr.get("id"),
          label: pr.get("name") || pr.get("id"),
        });
      }
    } else if (canSelf) {
      entities.push({
        id: authId,
        label: e.auth.get("name") || authId,
      });
    }
  } catch (err) {
    console.error("[selectable-entities] query failed:", err);
    return e.json(500, { error: "query failed" });
  }

  return e.json(200, { entities: entities });
});
