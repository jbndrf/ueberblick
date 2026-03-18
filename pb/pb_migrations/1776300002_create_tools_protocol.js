// pb_migrations/1776300002_create_tools_protocol.js
// Creates the tools_protocol collection for protocol tool configurations.
// Supports three attachment modes:
//   - Stage-attached: stage_id set, is_global=false (manual participant tool)
//   - Connection-attached: connection_id set (step in transition flow)
//   - Global/Region: is_global=true, stage_id defines region stages (auto-snapshot on exit)
migrate((app) => {
  const workflowsId = app.findCollectionByNameOrId("workflows").id;
  const connectionsId = app.findCollectionByNameOrId("workflow_connections").id;
  const stagesId = app.findCollectionByNameOrId("workflow_stages").id;
  const formFieldsId = app.findCollectionByNameOrId("tools_form_fields").id;
  const formsId = app.findCollectionByNameOrId("tools_forms").id;
  const rolesId = app.findCollectionByNameOrId("roles").id;

  // Admin: owns the project
  const adminRule = `
    connection_id.workflow_id.project_id.owner_id = @request.auth.id ||
    stage_id.workflow_id.project_id.owner_id ?= @request.auth.id
  `;

  // Participant: belongs to project + role check
  const participantRule = `
    @request.auth.collectionName = "participants" &&
    (
      (connection_id != "" && connection_id.workflow_id.project_id = @request.auth.project_id
        && (connection_id.allowed_roles:length = 0 || @request.auth.role_id.id ?= connection_id.allowed_roles.id))
      ||
      (stage_id:length > 0 && stage_id.workflow_id.project_id ?= @request.auth.project_id
        && (allowed_roles:length = 0 || @request.auth.role_id.id ?= allowed_roles.id))
    )
  `;

  const readRule = `${adminRule} || (${participantRule})`;
  const writeRule = adminRule;

  const collection = new Collection({
    type: "base",
    name: "tools_protocol",
    listRule: readRule,
    viewRule: readRule,
    createRule: writeRule,
    updateRule: writeRule,
    deleteRule: writeRule,
    fields: [
      {
        name: "workflow_id",
        type: "relation",
        required: true,
        collectionId: workflowsId,
        maxSelect: 1,
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
        name: "name",
        type: "text",
        required: true,
        max: 255,
      },
      {
        name: "editable_fields",
        type: "relation",
        collectionId: formFieldsId,
        maxSelect: 99,
      },
      {
        name: "prefill_config",
        type: "json",
      },
      {
        name: "protocol_form_id",
        type: "relation",
        collectionId: formsId,
        maxSelect: 1,
      },
      {
        name: "allowed_roles",
        type: "relation",
        collectionId: rolesId,
        maxSelect: 99,
      },
      {
        name: "visual_config",
        type: "json",
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
  app.delete(app.findCollectionByNameOrId("tools_protocol"));
});
