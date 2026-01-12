migrate((app) => {
  // Get collection IDs for relations
  const workflowsId = app.findCollectionByNameOrId("workflows").id;
  const rolesId = app.findCollectionByNameOrId("roles").id;

  // 1. Create workflow_stages collection
  const workflowStages = new Collection({
    type: "base",
    name: "workflow_stages",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      { name: "workflow_id", type: "relation", required: true, collectionId: workflowsId, maxSelect: 1 },
      { name: "stage_name", type: "text", required: true, max: 255 },
      { name: "stage_type", type: "select", required: true, values: ["start", "intermediate", "end"], maxSelect: 1 },
      { name: "stage_order", type: "number", min: 0 },
      { name: "position_x", type: "number" },
      { name: "position_y", type: "number" },
      { name: "visible_to_roles", type: "relation", collectionId: rolesId, maxSelect: 99 },
      { name: "visual_config", type: "json" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  app.save(workflowStages);

  // 2. Create workflow_connections collection
  const workflowConnections = new Collection({
    type: "base",
    name: "workflow_connections",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      { name: "workflow_id", type: "relation", required: true, collectionId: workflowsId, maxSelect: 1 },
      { name: "from_stage_id", type: "relation", collectionId: workflowStages.id, maxSelect: 1 }, // null = entry connection
      { name: "to_stage_id", type: "relation", required: true, collectionId: workflowStages.id, maxSelect: 1 },
      { name: "action_name", type: "text", required: true, max: 255 },
      { name: "allowed_roles", type: "relation", collectionId: rolesId, maxSelect: 99 },
      { name: "visual_config", type: "json" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  app.save(workflowConnections);

  // 3. Create tools_forms collection
  // Forms can belong to either a connection OR a stage (one or the other)
  const toolsForms = new Collection({
    type: "base",
    name: "tools_forms",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      { name: "workflow_id", type: "relation", required: true, collectionId: workflowsId, maxSelect: 1 },
      { name: "connection_id", type: "relation", collectionId: workflowConnections.id, maxSelect: 1 },
      { name: "stage_id", type: "relation", collectionId: workflowStages.id, maxSelect: 1 },
      { name: "name", type: "text", required: true, max: 255 },
      { name: "description", type: "text", max: 1000 },
      { name: "allowed_roles", type: "relation", collectionId: rolesId, maxSelect: 99 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  app.save(toolsForms);

  // 4. Create tools_form_fields collection
  const toolsFormFields = new Collection({
    type: "base",
    name: "tools_form_fields",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      { name: "form_id", type: "relation", required: true, collectionId: toolsForms.id, maxSelect: 1 },
      { name: "field_label", type: "text", required: true, max: 255 },
      { name: "field_type", type: "select", required: true, values: ["short_text", "long_text", "number", "email", "date", "file", "dropdown", "multiple_choice", "smart_dropdown"], maxSelect: 1 },
      { name: "field_order", type: "number", min: 0 },
      { name: "page", type: "number", min: 1 },
      { name: "page_title", type: "text", max: 255 },
      { name: "is_required", type: "bool" },
      { name: "placeholder", type: "text", max: 255 },
      { name: "help_text", type: "text", max: 1000 },
      { name: "validation_rules", type: "json" },
      { name: "field_options", type: "json" },
      { name: "conditional_logic", type: "json" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  app.save(toolsFormFields);

  // 5. Create tools_edit collection
  // Edit tools can belong to either a connection OR a stage (one or the other)
  const toolsEdit = new Collection({
    type: "base",
    name: "tools_edit",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      { name: "connection_id", type: "relation", collectionId: workflowConnections.id, maxSelect: 1 },
      { name: "stage_id", type: "relation", collectionId: workflowStages.id, maxSelect: 1 },
      { name: "editable_fields", type: "relation", required: true, collectionId: toolsFormFields.id, maxSelect: 99 },
      { name: "allowed_roles", type: "relation", collectionId: rolesId, maxSelect: 99 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  app.save(toolsEdit);

}, (app) => {
  // DOWN: Delete collections in reverse order
  app.delete(app.findCollectionByNameOrId("tools_edit"));
  app.delete(app.findCollectionByNameOrId("tools_form_fields"));
  app.delete(app.findCollectionByNameOrId("tools_forms"));
  app.delete(app.findCollectionByNameOrId("workflow_connections"));
  app.delete(app.findCollectionByNameOrId("workflow_stages"));
});
