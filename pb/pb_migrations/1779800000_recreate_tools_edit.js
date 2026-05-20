// pb_migrations/1779800000_recreate_tools_edit.js
//
// Re-create the tools_edit collection. It was dropped in 1779000000 (field-def
// redesign) on the assumption that editing would be folded into Form tools;
// that decision was reversed. The Edit tool is an in-place "edit mode" on the
// participant detail view.
//
// Differences from the pre-1779000000 schema:
//   - editable_fields now points at workflow_field_defs (the old tools_form_fields
//     collection no longer exists).
//   - self_edit_roles / any_edit_roles are baked in from the start (the model
//     introduced by 1778100000); there is no allowed_roles field.
//   - edit_mode discriminates a field-editing tool from a location-editing tool.
//
// self_edit_roles : members may edit only instances they created.
// any_edit_roles  : members may edit any instance. any wins on overlap.
// Empty arrays mean nobody (not "everyone").

migrate((app) => {
  const workflowsId = app.findCollectionByNameOrId("workflows").id;
  const connectionsId = app.findCollectionByNameOrId("workflow_connections").id;
  const stagesId = app.findCollectionByNameOrId("workflow_stages").id;
  const fieldDefsId = app.findCollectionByNameOrId("workflow_field_defs").id;
  const rolesId = app.findCollectionByNameOrId("roles").id;

  const adminRule = `workflow_id.project_id.owner_id = @request.auth.id`;

  const participantRule = `
    @request.auth.collectionName = "participants" &&
    workflow_id.project_id = @request.auth.project_id &&
    (@request.auth.role_id.id ?= any_edit_roles.id || @request.auth.role_id.id ?= self_edit_roles.id)
  `;

  const readRule = `${adminRule} || (${participantRule})`;

  const collection = new Collection({
    type: "base",
    name: "tools_edit",
    listRule: readRule,
    viewRule: readRule,
    createRule: adminRule,
    updateRule: adminRule,
    deleteRule: adminRule,
    fields: [
      {
        name: "workflow_id",
        type: "relation",
        required: true,
        collectionId: workflowsId,
        maxSelect: 1,
      },
      {
        name: "name",
        type: "text",
        required: true,
        max: 255,
      },
      {
        name: "connection_id",
        type: "relation",
        collectionId: connectionsId,
        maxSelect: 1,
      },
      {
        name: "stage_id",
        type: "relation",
        collectionId: stagesId,
        maxSelect: 99,
      },
      {
        name: "is_global",
        type: "bool",
      },
      {
        name: "editable_fields",
        type: "relation",
        collectionId: fieldDefsId,
        maxSelect: 99,
      },
      {
        name: "edit_mode",
        type: "select",
        required: true,
        values: ["form_fields", "location"],
        maxSelect: 1,
      },
      {
        name: "self_edit_roles",
        type: "relation",
        collectionId: rolesId,
        maxSelect: 99,
      },
      {
        name: "any_edit_roles",
        type: "relation",
        collectionId: rolesId,
        maxSelect: 99,
      },
      {
        name: "visual_config",
        type: "json",
      },
      {
        name: "tool_order",
        type: "number",
        min: 0,
      },
      {
        name: "created",
        type: "autodate",
        onCreate: true,
      },
      {
        name: "updated",
        type: "autodate",
        onCreate: true,
        onUpdate: true,
      },
    ],
  });

  app.save(collection);
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("tools_edit"));
  } catch (e) {
    /* already gone */
  }
});
