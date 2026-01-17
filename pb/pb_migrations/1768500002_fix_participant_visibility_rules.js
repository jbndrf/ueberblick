// pb_migrations/1768500002_fix_participant_visibility_rules.js
// Add "empty = all" logic: when visible_to_roles/allowed_roles is empty, allow all participants
// Also: markers inherit visibility from their category instead of own visible_to_roles
migrate((app) => {
  let collection

  // Helper for common participant project check
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  // Helper for role-based visibility with "empty = all" logic
  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id ?= ${rolesField})`

  // Helper for markers - handles case where category_id might be empty
  const markerRoleCheck = () =>
    `(category_id = "" || category_id.visible_to_roles:length = 0 || @request.auth.role_id ?= category_id.visible_to_roles)`

  // ============================================
  // Update workflow_stages - empty visible_to_roles = all
  // ============================================
  collection = app.findCollectionByNameOrId("workflow_stages")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("visible_to_roles")})`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("visible_to_roles")})`
    app.save(collection)
  }

  // ============================================
  // Update workflow_connections - empty allowed_roles = all
  // ============================================
  collection = app.findCollectionByNameOrId("workflow_connections")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("allowed_roles")})`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("allowed_roles")})`
    app.save(collection)
  }

  // ============================================
  // Update marker_categories - empty visible_to_roles = all
  // ============================================
  collection = app.findCollectionByNameOrId("marker_categories")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    app.save(collection)
  }

  // ============================================
  // Update markers - inherit visibility from category
  // Handles: no category, category with empty roles (=all), category with specific roles
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
  // Update workflow_instances - empty current_stage_id.visible_to_roles = all
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
  // Update custom_tables - empty visible_to_roles = all
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
  // Update map_layers - empty visible_to_roles = all
  // ============================================
  collection = app.findCollectionByNameOrId("map_layers")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && ${roleCheck("visible_to_roles")})`
    app.save(collection)
  }

}, (app) => {
  // DOWN: Revert to strict role-based rules (no "empty = all" logic)
  let collection

  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  collection = app.findCollectionByNameOrId("workflow_stages")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && @request.auth.role_id ?= visible_to_roles)`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && @request.auth.role_id ?= visible_to_roles)`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("workflow_connections")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && @request.auth.role_id ?= allowed_roles)`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && @request.auth.role_id ?= allowed_roles)`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("marker_categories")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= visible_to_roles)`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= visible_to_roles)`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("markers")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= category_id.visible_to_roles)`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= category_id.visible_to_roles)`
    collection.createRule = `project_id.owner_id = @request.auth.id || ${participantInProject("project_id")}`
    collection.updateRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= category_id.visible_to_roles)`
    collection.deleteRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= category_id.visible_to_roles)`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("workflow_instances")
  if (collection) {
    collection.listRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || created_by = @request.auth.id
      || (${participantInProject("workflow_id.project_id")} && @request.auth.role_id ?= current_stage_id.visible_to_roles)
    `
    collection.viewRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || created_by = @request.auth.id
      || (${participantInProject("workflow_id.project_id")} && @request.auth.role_id ?= current_stage_id.visible_to_roles)
    `
    collection.updateRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("workflow_id.project_id")}
          && (created_by = @request.auth.id || @request.auth.role_id ?= current_stage_id.visible_to_roles))
    `
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("workflow_instance_tool_usage")
  if (collection) {
    collection.listRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && @request.auth.role_id ?= instance_id.current_stage_id.visible_to_roles)
    `
    collection.viewRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && @request.auth.role_id ?= instance_id.current_stage_id.visible_to_roles)
    `
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("workflow_instance_field_values")
  if (collection) {
    collection.listRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && @request.auth.role_id ?= stage_id.visible_to_roles)
    `
    collection.viewRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || instance_id.created_by = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && @request.auth.role_id ?= stage_id.visible_to_roles)
    `
    collection.updateRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && @request.auth.role_id ?= stage_id.visible_to_roles)
    `
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("custom_tables")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= visible_to_roles)`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= visible_to_roles)`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("custom_table_columns")
  if (collection) {
    collection.listRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && @request.auth.role_id ?= table_id.visible_to_roles)`
    collection.viewRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && @request.auth.role_id ?= table_id.visible_to_roles)`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("custom_table_data")
  if (collection) {
    collection.listRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && @request.auth.role_id ?= table_id.visible_to_roles)`
    collection.viewRule = `table_id.project_id.owner_id = @request.auth.id || (${participantInProject("table_id.project_id")} && @request.auth.role_id ?= table_id.visible_to_roles)`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("map_layers")
  if (collection) {
    collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= visible_to_roles)`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject("project_id")} && @request.auth.role_id ?= visible_to_roles)`
    app.save(collection)
  }
})
