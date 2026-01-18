// pb_migrations/1768800001_workflow_access_rules.js
// Implements the 4-layer access control model for workflow builder:
//
// LAYER 1: Project Membership (base requirement)
//   - participant.project_id = resource.project_id
//
// LAYER 2: Structure Transparency (visible to ALL in project)
//   - workflow_stages: names, types, visual config, order
//   - workflow_instances: current stage, status, progress
//
// LAYER 2b: Connection Visibility (role-based)
//   - workflow_connections: only visible if role in allowed_roles (empty = all)
//
// LAYER 3: Implementation Protection (role-based)
//   - tools_forms / tools_form_fields / tools_edit
//   - workflow_instance_field_values (THE ACTUAL SENSITIVE DATA)
//
// LAYER 4: Action Permissions
//   - workflow.entry_allowed_roles: who can CREATE new instances
//   - connection.allowed_roles: who can trigger transitions
//   - stage.visible_to_roles: who can submit/edit data at that stage
//
// EMPTY ARRAY CONVENTION:
//   visible_to_roles = []  -->  ALL roles can see
//   allowed_roles = []     -->  ALL roles can execute
//   entry_allowed_roles = []  -->  ALL participants can create instances

migrate((app) => {
  let collection

  // Helper for common participant project check
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  // FIXED: Role-based visibility with "empty = all" logic
  // Uses .id on both sides for proper multi-relation array comparison
  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`

  // ============================================================================
  // TRANSPARENT COLLECTIONS - visible to all project participants
  // ============================================================================

  // workflow_stages - OPEN
  // Everyone sees all stages (names, types, visual config, positions)
  collection = app.findCollectionByNameOrId("workflow_stages")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("workflow_id.project_id")}`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || ${participantInProject("workflow_id.project_id")}`
    // create/update/delete remain admin-only (already set)
    app.save(collection)
  }

  // workflow_connections - PROTECTED by allowed_roles
  // Only see connections where your role is in allowed_roles (empty = all)
  collection = app.findCollectionByNameOrId("workflow_connections")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("allowed_roles")})`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("allowed_roles")})`
    // create/update/delete remain admin-only (already set)
    app.save(collection)
  }

  // workflow_instances - OPEN with entry_allowed_roles create check
  // Everyone sees all instances (progress transparency)
  // CREATE: Only if role is in workflow.entry_allowed_roles (empty = all allowed)
  collection = app.findCollectionByNameOrId("workflow_instances")
  if (collection) {
    // LIST/VIEW: Everyone in project can see all instances (progress transparency)
    collection.listRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || ${participantInProject("workflow_id.project_id")}
    `
    collection.viewRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || ${participantInProject("workflow_id.project_id")}
    `

    // CREATE: Admin OR participant with role in entry_allowed_roles (empty = all)
    collection.createRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("workflow_id.project_id")}
          && ${roleCheck("workflow_id.entry_allowed_roles")})
    `

    // UPDATE: Admin or role can see current stage
    collection.updateRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("workflow_id.project_id")}
          && ${roleCheck("current_stage_id.visible_to_roles")})
    `

    // DELETE: Admin only
    collection.deleteRule = `workflow_id.project_id.owner_id = @request.auth.id`

    app.save(collection)
  }

  // ============================================================================
  // PROTECTED COLLECTIONS - role-based visibility
  // ============================================================================

  // tools_forms - PROTECTED by form's own allowed_roles OR connection's allowed_roles
  // Connection-attached: inherit from connection.allowed_roles
  // Stage-attached: use the form's OWN allowed_roles (not stage.visible_to_roles)
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
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // tools_form_fields - PROTECTED (inherits from parent form's allowed_roles)
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
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // tools_edit - PROTECTED by tool's own allowed_roles OR connection's allowed_roles
  // Connection-attached: inherit from connection.allowed_roles
  // Stage-attached: use the tool's OWN allowed_roles (not stage.visible_to_roles)
  collection = app.findCollectionByNameOrId("tools_edit")
  if (collection) {
    const editParticipantRule = `
      @request.auth.collectionName = "participants" &&
      (
        (connection_id != "" && connection_id.workflow_id.project_id = @request.auth.project_id
          && ${roleCheck("connection_id.allowed_roles")}) ||
        (stage_id != "" && stage_id.workflow_id.project_id = @request.auth.project_id
          && ${roleCheck("allowed_roles")})
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
    // create/update/delete remain admin-only
    app.save(collection)
  }

  // workflow_instance_field_values - PROTECTED by stage
  // READ: Only see values for stages your role can access (stage_id.visible_to_roles)
  // CREATE: Allowed if you can act at current stage (enables transition form submission)
  // UPDATE: Only if you can see the stage (stage_id.visible_to_roles)
  collection = app.findCollectionByNameOrId("workflow_instance_field_values")
  if (collection) {
    collection.listRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")}
          && ${roleCheck("stage_id.visible_to_roles")})
    `
    collection.viewRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")}
          && ${roleCheck("stage_id.visible_to_roles")})
    `

    // CREATE: Check current stage visibility OR entry permission
    // - Stage visibility: allows transition form data to be saved
    // - Entry permission: allows creating instance + field values without needing stage visibility
    collection.createRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")}
          && (${roleCheck("instance_id.current_stage_id.visible_to_roles")}
              || ${roleCheck("instance_id.workflow_id.entry_allowed_roles")}))
    `

    // UPDATE: Must have visibility to the stage where data belongs
    collection.updateRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")}
          && ${roleCheck("stage_id.visible_to_roles")})
    `

    // DELETE: Owner only
    collection.deleteRule = `instance_id.workflow_id.project_id.owner_id = @request.auth.id`

    app.save(collection)
  }

  // workflow_instance_tool_usage - PROTECTED by current stage
  // Audit trail follows same visibility as current stage
  collection = app.findCollectionByNameOrId("workflow_instance_tool_usage")
  if (collection) {
    collection.listRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")}
          && ${roleCheck("instance_id.current_stage_id.visible_to_roles")})
    `
    collection.viewRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")}
          && ${roleCheck("instance_id.current_stage_id.visible_to_roles")})
    `
    // create/update/delete rules remain as before
    app.save(collection)
  }

}, (app) => {
  // DOWN: Revert to previous rules (from migration 1768700000)
  let collection

  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`

  // Revert workflow_stages to role-based
  collection = app.findCollectionByNameOrId("workflow_stages")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("visible_to_roles")})`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("visible_to_roles")})`
    app.save(collection)
  }

  // Revert workflow_connections to role-based
  collection = app.findCollectionByNameOrId("workflow_connections")
  if (collection) {
    collection.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("allowed_roles")})`
    collection.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${participantInProject("workflow_id.project_id")} && ${roleCheck("allowed_roles")})`
    app.save(collection)
  }

  // Revert workflow_instances
  collection = app.findCollectionByNameOrId("workflow_instances")
  if (collection) {
    collection.listRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("workflow_id.project_id")} && ${roleCheck("current_stage_id.visible_to_roles")})
    `
    collection.viewRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("workflow_id.project_id")} && ${roleCheck("current_stage_id.visible_to_roles")})
    `
    collection.createRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("workflow_id.project_id")})
    `
    collection.updateRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("workflow_id.project_id")}
          && ${roleCheck("current_stage_id.visible_to_roles")})
    `
    app.save(collection)
  }

  // Revert tools_forms to previous rules
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

  // Revert tools_form_fields to previous rules
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

  // Revert tools_edit to previous rules
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

  // workflow_instance_field_values - current stage for CREATE, destination stage for READ/UPDATE
  collection = app.findCollectionByNameOrId("workflow_instance_field_values")
  if (collection) {
    collection.listRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("stage_id.visible_to_roles")})
    `
    collection.viewRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("stage_id.visible_to_roles")})
    `
    collection.createRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("instance_id.current_stage_id.visible_to_roles")})
    `
    collection.updateRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("stage_id.visible_to_roles")})
    `
    app.save(collection)
  }

  // workflow_instance_tool_usage - no creator bypass
  collection = app.findCollectionByNameOrId("workflow_instance_tool_usage")
  if (collection) {
    collection.listRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("instance_id.current_stage_id.visible_to_roles")})
    `
    collection.viewRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")} && ${roleCheck("instance_id.current_stage_id.visible_to_roles")})
    `
    app.save(collection)
  }
})
