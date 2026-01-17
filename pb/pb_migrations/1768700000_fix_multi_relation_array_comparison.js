// pb_migrations/1768700000_fix_multi_relation_array_comparison.js
// Fix: multi-relation array comparison requires .id on both sides
// Wrong: @request.auth.role_id ?= visible_to_roles
// Correct: @request.auth.role_id.id ?= visible_to_roles.id
// See: https://github.com/pocketbase/pocketbase/discussions/1817
migrate((app) => {
  let collection

  // Helper for common participant project check
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  // FIXED: Role-based visibility with "empty = all" logic
  // Now uses .id on both sides for proper multi-relation array comparison
  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`

  // FIXED: For markers - handles case where category_id might be empty
  const markerRoleCheck = () =>
    `(category_id = "" || category_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= category_id.visible_to_roles.id)`

  // ============================================
  // Update workflow_stages
  // ============================================
  collection = app.findCollectionByNameOrId("workflow_stages")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("visible_to_roles")})`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("visible_to_roles")})`
    app.save(collection)
  }

  // ============================================
  // Update workflow_connections
  // ============================================
  collection = app.findCollectionByNameOrId("workflow_connections")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("allowed_roles")})`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("allowed_roles")})`
    app.save(collection)
  }

  // ============================================
  // Update marker_categories
  // ============================================
  collection = app.findCollectionByNameOrId("marker_categories")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    app.save(collection)
  }

  // ============================================
  // Update markers
  // ============================================
  collection = app.findCollectionByNameOrId("markers")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${markerRoleCheck()})`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${markerRoleCheck()})`
    collection.createRule = `project_id.owner_id = @request.auth.id || ${participantInProject("project_id")}`
    collection.updateRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${markerRoleCheck()})`
    collection.deleteRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${markerRoleCheck()})`
    app.save(collection)
  }

  // ============================================
  // Update workflow_instances
  // ============================================
  collection = app.findCollectionByNameOrId("workflow_instances")
  if (collection) {
    collection.listRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || created_by = @request.auth.id
      || (${participantInProject("workflow_id.project_id")} && ${roleCheck("current_stage_id.visible_to_roles")})
    `
    collection.viewRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || created_by = @request.auth.id
      || (${participantInProject("workflow_id.project_id")} && ${roleCheck("current_stage_id.visible_to_roles")})
    `
    collection.updateRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("workflow_id.project_id")}
          && (created_by = @request.auth.id || ${roleCheck("current_stage_id.visible_to_roles")}))
    `
    app.save(collection)
  }

  // ============================================
  // Update workflow_instance_tool_usage
  // ============================================
  collection = app.findCollectionByNameOrId("workflow_instance_tool_usage")
  if (collection) {
    collection.listRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("instance_id.current_stage_id.visible_to_roles")})
    `
    collection.viewRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("instance_id.current_stage_id.visible_to_roles")})
    `
    app.save(collection)
  }

  // ============================================
  // Update workflow_instance_field_values
  // ============================================
  collection = app.findCollectionByNameOrId("workflow_instance_field_values")
  if (collection) {
    collection.listRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("stage_id.visible_to_roles")})
    `
    collection.viewRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("stage_id.visible_to_roles")})
    `
    collection.updateRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("stage_id.visible_to_roles")})
    `
    app.save(collection)
  }

  // ============================================
  // Update custom_tables
  // ============================================
  collection = app.findCollectionByNameOrId("custom_tables")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    app.save(collection)
  }

  // ============================================
  // Update custom_table_columns
  // ============================================
  collection = app.findCollectionByNameOrId("custom_table_columns")
  if (collection) {
    collection.listRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && ${roleCheck("table_id.visible_to_roles")})`
    collection.viewRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && ${roleCheck("table_id.visible_to_roles")})`
    app.save(collection)
  }

  // ============================================
  // Update custom_table_data
  // ============================================
  collection = app.findCollectionByNameOrId("custom_table_data")
  if (collection) {
    collection.listRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && ${roleCheck("table_id.visible_to_roles")})`
    collection.viewRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && ${roleCheck("table_id.visible_to_roles")})`
    app.save(collection)
  }

  // ============================================
  // Update map_layers
  // ============================================
  collection = app.findCollectionByNameOrId("map_layers")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    app.save(collection)
  }

}, (app) => {
  // DOWN: Revert to old syntax (without .id)
  let collection

  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id ?= ${rolesField})`

  const markerRoleCheck = () =>
    `(category_id = "" || category_id.visible_to_roles:length = 0 || @request.auth.role_id ?= category_id.visible_to_roles)`

  collection = app.findCollectionByNameOrId("workflow_stages")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("visible_to_roles")})`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("visible_to_roles")})`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("workflow_connections")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("allowed_roles")})`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("allowed_roles")})`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("marker_categories")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("markers")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${markerRoleCheck()})`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${markerRoleCheck()})`
    collection.createRule = `project_id.owner_id = @request.auth.id || ${participantInProject("project_id")}`
    collection.updateRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${markerRoleCheck()})`
    collection.deleteRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${markerRoleCheck()})`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("workflow_instances")
  if (collection) {
    collection.listRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || created_by = @request.auth.id
      || (${participantInProject("workflow_id.project_id")} && ${roleCheck("current_stage_id.visible_to_roles")})
    `
    collection.viewRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || created_by = @request.auth.id
      || (${participantInProject("workflow_id.project_id")} && ${roleCheck("current_stage_id.visible_to_roles")})
    `
    collection.updateRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("workflow_id.project_id")}
          && (created_by = @request.auth.id || ${roleCheck("current_stage_id.visible_to_roles")}))
    `
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("workflow_instance_tool_usage")
  if (collection) {
    collection.listRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("instance_id.current_stage_id.visible_to_roles")})
    `
    collection.viewRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("instance_id.current_stage_id.visible_to_roles")})
    `
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("workflow_instance_field_values")
  if (collection) {
    collection.listRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("stage_id.visible_to_roles")})
    `
    collection.viewRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("stage_id.visible_to_roles")})
    `
    collection.updateRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("stage_id.visible_to_roles")})
    `
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("custom_tables")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("custom_table_columns")
  if (collection) {
    collection.listRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && ${roleCheck("table_id.visible_to_roles")})`
    collection.viewRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && ${roleCheck("table_id.visible_to_roles")})`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("custom_table_data")
  if (collection) {
    collection.listRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && ${roleCheck("table_id.visible_to_roles")})`
    collection.viewRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && ${roleCheck("table_id.visible_to_roles")})`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("map_layers")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    app.save(collection)
  }
})
