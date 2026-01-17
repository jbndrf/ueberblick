// pb_migrations/1768400000_workflow_instances_and_participant_rules.js
// Creates workflow instance collections and updates rules for participant access
migrate((app) => {
  // Get collection IDs for relations
  const workflowsId = app.findCollectionByNameOrId("workflows").id
  const workflowStagesId = app.findCollectionByNameOrId("workflow_stages").id
  const participantsId = app.findCollectionByNameOrId("participants").id

  // ============================================
  // PART 1: Create new collections
  // ============================================

  // 1. Create workflow_instances collection
  const workflowInstances = new Collection({
    type: "base",
    name: "workflow_instances",
    listRule: `
      workflow_id.project_id.owner_id = @request.auth.id
      || created_by = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && workflow_id.project_id = @request.auth.project_id
          && @request.auth.role_id ?= current_stage_id.visible_to_roles)
    `,
    viewRule: `
      workflow_id.project_id.owner_id = @request.auth.id
      || created_by = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && workflow_id.project_id = @request.auth.project_id
          && @request.auth.role_id ?= current_stage_id.visible_to_roles)
    `,
    createRule: `
      workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && workflow_id.project_id = @request.auth.project_id)
    `,
    updateRule: `
      workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && workflow_id.project_id = @request.auth.project_id
          && (created_by = @request.auth.id || @request.auth.role_id ?= current_stage_id.visible_to_roles))
    `,
    deleteRule: "workflow_id.project_id.owner_id = @request.auth.id",
    fields: [
      { name: "workflow_id", type: "relation", required: true, collectionId: workflowsId, maxSelect: 1 },
      { name: "current_stage_id", type: "relation", required: true, collectionId: workflowStagesId, maxSelect: 1 },
      { name: "status", type: "select", required: true, values: ["active", "completed", "archived", "deleted"], maxSelect: 1 },
      { name: "created_by", type: "relation", required: true, collectionId: participantsId, maxSelect: 1 },
      { name: "location", type: "json" },
      { name: "files", type: "file", maxSelect: 99, maxSize: 10485760 }, // 10MB per file
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  })
  app.save(workflowInstances)

  // 2. Create workflow_instance_tool_usage collection (needed for field_values relations)
  const workflowInstanceToolUsage = new Collection({
    type: "base",
    name: "workflow_instance_tool_usage",
    listRule: `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id
          && @request.auth.role_id ?= instance_id.current_stage_id.visible_to_roles)
    `,
    viewRule: `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id
          && @request.auth.role_id ?= instance_id.current_stage_id.visible_to_roles)
    `,
    createRule: `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id)
    `,
    updateRule: "instance_id.workflow_id.project_id.owner_id = @request.auth.id",
    deleteRule: "instance_id.workflow_id.project_id.owner_id = @request.auth.id",
    fields: [
      { name: "instance_id", type: "relation", required: true, collectionId: workflowInstances.id, maxSelect: 1 },
      { name: "executed_by", type: "relation", required: true, collectionId: participantsId, maxSelect: 1 },
      { name: "executed_at", type: "date", required: true },
      { name: "metadata", type: "json" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  })
  app.save(workflowInstanceToolUsage)

  // 3. Create workflow_instance_field_values collection
  const workflowInstanceFieldValues = new Collection({
    type: "base",
    name: "workflow_instance_field_values",
    listRule: `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id
          && @request.auth.role_id ?= stage_id.visible_to_roles)
    `,
    viewRule: `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id
          && @request.auth.role_id ?= stage_id.visible_to_roles)
    `,
    createRule: `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id)
    `,
    updateRule: `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id
          && @request.auth.role_id ?= stage_id.visible_to_roles)
    `,
    deleteRule: "instance_id.workflow_id.project_id.owner_id = @request.auth.id",
    fields: [
      { name: "instance_id", type: "relation", required: true, collectionId: workflowInstances.id, maxSelect: 1 },
      { name: "field_key", type: "text", required: true, max: 255 },
      { name: "value", type: "text" },
      { name: "file_value", type: "file", maxSelect: 1, maxSize: 10485760 },
      { name: "stage_id", type: "relation", required: true, collectionId: workflowStagesId, maxSelect: 1 },
      { name: "created_by_action", type: "relation", collectionId: workflowInstanceToolUsage.id, maxSelect: 1 },
      { name: "last_modified_by_action", type: "relation", collectionId: workflowInstanceToolUsage.id, maxSelect: 1 },
      { name: "last_modified_at", type: "date" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  })
  app.save(workflowInstanceFieldValues)

  // ============================================
  // PART 2: Update existing collection rules for participant access
  // ============================================

  let collection

  // Helper for common participant project check
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  // workflows - participants can list/view active workflows in their project
  collection = app.findCollectionByNameOrId("workflows")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && is_active = true)`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && is_active = true)`
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // workflow_stages - participants can see stages where their role is in visible_to_roles
  collection = app.findCollectionByNameOrId("workflow_stages")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && @request.auth.role_id ?= visible_to_roles)`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && @request.auth.role_id ?= visible_to_roles)`
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // workflow_connections - participants can see connections where their role is in allowed_roles
  collection = app.findCollectionByNameOrId("workflow_connections")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && @request.auth.role_id ?= allowed_roles)`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && @request.auth.role_id ?= allowed_roles)`
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // tools_forms - participants can see forms in their project
  // Visibility inherited from parent stage/connection, but we allow access if in project
  collection = app.findCollectionByNameOrId("tools_forms")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("workflow_id.project_id")}`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("workflow_id.project_id")}`
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // tools_form_fields - participants can see form fields in their project
  collection = app.findCollectionByNameOrId("tools_form_fields")
  if (collection) {
    collection.listRule = `form_id.workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("form_id.workflow_id.project_id")}`
    collection.viewRule = `form_id.workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("form_id.workflow_id.project_id")}`
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // tools_edit - participants can see edit tools in their project
  collection = app.findCollectionByNameOrId("tools_edit")
  if (collection) {
    collection.listRule = `(connection_id.workflow_id.project_id.owner_id = @request.auth.id) || (stage_id.workflow_id.project_id.owner_id = @request.auth.id) || ${participantInProject("connection_id.workflow_id.project_id")} || ${participantInProject("stage_id.workflow_id.project_id")}`
    collection.viewRule = `(connection_id.workflow_id.project_id.owner_id = @request.auth.id) || (stage_id.workflow_id.project_id.owner_id = @request.auth.id) || ${participantInProject("connection_id.workflow_id.project_id")} || ${participantInProject("stage_id.workflow_id.project_id")}`
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // roles - participants can list/view roles in their project (read-only)
  collection = app.findCollectionByNameOrId("roles")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || ${participantInProject("project_id")}`
    collection.viewRule = `project_id.owner_id = @request.auth.id || ${participantInProject("project_id")}`
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // marker_categories - basic participant access (role check added in next migration after JSON->relation conversion)
  collection = app.findCollectionByNameOrId("marker_categories")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || ${participantInProject("project_id")}`
    collection.viewRule = `project_id.owner_id = @request.auth.id || ${participantInProject("project_id")}`
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // markers - participants get full CRUD in their project
  collection = app.findCollectionByNameOrId("markers")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || ${participantInProject("project_id")}`
    collection.viewRule = `project_id.owner_id = @request.auth.id || ${participantInProject("project_id")}`
    collection.createRule = `project_id.owner_id = @request.auth.id || ${participantInProject("project_id")}`
    collection.updateRule = `project_id.owner_id = @request.auth.id || ${participantInProject("project_id")}`
    collection.deleteRule = `project_id.owner_id = @request.auth.id || ${participantInProject("project_id")}`
    app.save(collection)
  }

  // custom_tables - participants can see tables where their role is in visible_to_roles
  collection = app.findCollectionByNameOrId("custom_tables")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= visible_to_roles)`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= visible_to_roles)`
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // custom_table_columns - participants can see columns for tables they can access
  collection = app.findCollectionByNameOrId("custom_table_columns")
  if (collection) {
    collection.listRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && @request.auth.role_id ?= table_id.visible_to_roles)`
    collection.viewRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && @request.auth.role_id ?= table_id.visible_to_roles)`
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // custom_table_data - participants can see data for tables they can access
  collection = app.findCollectionByNameOrId("custom_table_data")
  if (collection) {
    collection.listRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && @request.auth.role_id ?= table_id.visible_to_roles)`
    collection.viewRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && @request.auth.role_id ?= table_id.visible_to_roles)`
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // map_layers - participants can see layers where their role is in visible_to_roles
  collection = app.findCollectionByNameOrId("map_layers")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= visible_to_roles)`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= visible_to_roles)`
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // map_sources - participants can view sources (needed to load tiles)
  collection = app.findCollectionByNameOrId("map_sources")
  if (collection) {
    collection.listRule = `owner_id = @request.auth.id || @request.auth.collectionName = "participants"`
    collection.viewRule = `owner_id = @request.auth.id || @request.auth.collectionName = "participants"`
    // create/update/delete remain as before
    app.save(collection)
  }

}, (app) => {
  // DOWN: Delete new collections and restore old rules

  // Delete new collections
  try { app.delete(app.findCollectionByNameOrId("workflow_instance_field_values")) } catch(e) {}
  try { app.delete(app.findCollectionByNameOrId("workflow_instance_tool_usage")) } catch(e) {}
  try { app.delete(app.findCollectionByNameOrId("workflow_instances")) } catch(e) {}

  // Restore admin-only rules (copy from previous migration's state)
  let collection

  collection = app.findCollectionByNameOrId("workflows")
  if (collection) {
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("workflow_stages")
  if (collection) {
    collection.listRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.viewRule = "workflow_id.project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("workflow_connections")
  if (collection) {
    collection.listRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.viewRule = "workflow_id.project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("tools_forms")
  if (collection) {
    collection.listRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.viewRule = "workflow_id.project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("tools_form_fields")
  if (collection) {
    collection.listRule = "form_id.workflow_id.project_id.owner_id = @request.auth.id"
    collection.viewRule = "form_id.workflow_id.project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("tools_edit")
  if (collection) {
    collection.listRule = "(connection_id.workflow_id.project_id.owner_id = @request.auth.id) || (stage_id.workflow_id.project_id.owner_id = @request.auth.id)"
    collection.viewRule = "(connection_id.workflow_id.project_id.owner_id = @request.auth.id) || (stage_id.workflow_id.project_id.owner_id = @request.auth.id)"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("roles")
  if (collection) {
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("marker_categories")
  if (collection) {
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("markers")
  if (collection) {
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    collection.createRule = "project_id.owner_id = @request.auth.id"
    collection.updateRule = "project_id.owner_id = @request.auth.id"
    collection.deleteRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("custom_tables")
  if (collection) {
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("custom_table_columns")
  if (collection) {
    collection.listRule = "table_id.project_id.owner_id = @request.auth.id"
    collection.viewRule = "table_id.project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("custom_table_data")
  if (collection) {
    collection.listRule = "table_id.project_id.owner_id = @request.auth.id"
    collection.viewRule = "table_id.project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("map_layers")
  if (collection) {
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("map_sources")
  if (collection) {
    collection.listRule = "owner_id = @request.auth.id"
    collection.viewRule = "owner_id = @request.auth.id"
    app.save(collection)
  }
})
