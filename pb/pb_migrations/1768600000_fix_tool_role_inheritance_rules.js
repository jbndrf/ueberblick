// pb_migrations/1768600000_fix_tool_role_inheritance_rules.js
// Fix API rules for tools to implement proper role inheritance:
// - Connection-attached tools: inherit allowed_roles from connection
// - Stage-attached tools: use their own allowed_roles
migrate((app) => {
  // Helper for common participant project check
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  // Helper for role-based visibility with "empty = all" logic
  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id ?= ${rolesField})`

  let collection

  // ============================================
  // Update tools_forms - implement role inheritance
  // Connection-attached: inherit from connection.allowed_roles
  // Stage-attached: use own allowed_roles
  // ============================================
  collection = app.findCollectionByNameOrId("tools_forms")
  if (collection) {
    const formsParticipantRule = `
      ${participantInProject("workflow_id.project_id")} &&
      (
        (connection_id != "" && ${roleCheck("connection_id.allowed_roles")}) ||
        (stage_id != "" && ${roleCheck("allowed_roles")})
      )
    `

    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${formsParticipantRule})`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${formsParticipantRule})`
    app.save(collection)
  }

  // ============================================
  // Update tools_edit - implement role inheritance
  // Connection-attached: inherit from connection.allowed_roles
  // Stage-attached: use own allowed_roles
  // ============================================
  collection = app.findCollectionByNameOrId("tools_edit")
  if (collection) {
    const editParticipantRule = `
      @request.auth.collectionName = "participants" &&
      (
        (connection_id != "" && connection_id.workflow_id.project_id = @request.auth.project_id && ${roleCheck("connection_id.allowed_roles")}) ||
        (stage_id != "" && stage_id.workflow_id.project_id = @request.auth.project_id && ${roleCheck("allowed_roles")})
      )
    `

    collection.listRule = `
      connection_id.workflow_id.project_id.owner_id = @request.auth.id ||
      stage_id.workflow_id.project_id.owner_id = @request.auth.id ||
      (${editParticipantRule})
    `
    collection.viewRule = `
      connection_id.workflow_id.project_id.owner_id = @request.auth.id ||
      stage_id.workflow_id.project_id.owner_id = @request.auth.id ||
      (${editParticipantRule})
    `
    app.save(collection)
  }

  // ============================================
  // Update tools_form_fields - inherit from parent form's access
  // ============================================
  collection = app.findCollectionByNameOrId("tools_form_fields")
  if (collection) {
    const fieldsParticipantRule = `
      ${participantInProject("form_id.workflow_id.project_id")} &&
      (
        (form_id.connection_id != "" && ${roleCheck("form_id.connection_id.allowed_roles")}) ||
        (form_id.stage_id != "" && ${roleCheck("form_id.allowed_roles")})
      )
    `

    collection.listRule = `form_id.workflow_id.project_id.owner_id = @request.auth.id || (${fieldsParticipantRule})`
    collection.viewRule = `form_id.workflow_id.project_id.owner_id = @request.auth.id || (${fieldsParticipantRule})`
    app.save(collection)
  }

}, (app) => {
  // DOWN: Revert to simple project-based rules (no role inheritance)
  let collection

  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  collection = app.findCollectionByNameOrId("tools_forms")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("workflow_id.project_id")}`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("workflow_id.project_id")}`
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("tools_edit")
  if (collection) {
    collection.listRule = `
      connection_id.workflow_id.project_id.owner_id = @request.auth.id ||
      stage_id.workflow_id.project_id.owner_id = @request.auth.id ||
      (${participantInProject("connection_id.workflow_id.project_id")}) ||
      (${participantInProject("stage_id.workflow_id.project_id")})
    `
    collection.viewRule = `
      connection_id.workflow_id.project_id.owner_id = @request.auth.id ||
      stage_id.workflow_id.project_id.owner_id = @request.auth.id ||
      (${participantInProject("connection_id.workflow_id.project_id")}) ||
      (${participantInProject("stage_id.workflow_id.project_id")})
    `
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("tools_form_fields")
  if (collection) {
    collection.listRule = `form_id.workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("form_id.workflow_id.project_id")}`
    collection.viewRule = `form_id.workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("form_id.workflow_id.project_id")}`
    app.save(collection)
  }
})
