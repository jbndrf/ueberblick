// pb_migrations/1780000000_global_forms_visibility.js
// Allow participants to see GLOBAL forms (no connection_id and no stage_id).
// Global forms are available on every stage and gate visibility by their own
// allowed_roles (empty = all roles), mirroring the stage-attached form rule.
//
// tools_form_fields was dropped in 1779000000 and replaced by
// tools_form_field_refs — we update the ref collection here.
migrate((app) => {
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`

  // ============================================
  // tools_forms — add a global-form clause
  // Connection-attached: inherit from connection.allowed_roles
  // Stage-attached: use own allowed_roles
  // Global (no connection_id, no stage_id): use own allowed_roles
  // ============================================
  const forms = app.findCollectionByNameOrId("tools_forms")
  const formsParticipantRule = `
    ${participantInProject("workflow_id.project_id")} &&
    (
      (connection_id != "" && ${roleCheck("connection_id.allowed_roles")}) ||
      (stage_id != "" && ${roleCheck("allowed_roles")}) ||
      (connection_id = "" && stage_id = "" && ${roleCheck("allowed_roles")})
    )
  `
  forms.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${formsParticipantRule})`
  forms.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${formsParticipantRule})`
  app.save(forms)

  // ============================================
  // tools_form_field_refs — inherit from parent form's access (incl. global forms)
  // ============================================
  const refs = app.findCollectionByNameOrId("tools_form_field_refs")
  const refsParticipantRule = `
    ${participantInProject("form_id.workflow_id.project_id")} &&
    (
      (form_id.connection_id != "" && ${roleCheck("form_id.connection_id.allowed_roles")}) ||
      (form_id.stage_id != "" && ${roleCheck("form_id.allowed_roles")}) ||
      (form_id.connection_id = "" && form_id.stage_id = "" && ${roleCheck("form_id.allowed_roles")})
    )
  `
  refs.listRule = `form_id.workflow_id.project_id.owner_id = @request.auth.id || (${refsParticipantRule})`
  refs.viewRule = `form_id.workflow_id.project_id.owner_id = @request.auth.id || (${refsParticipantRule})`
  app.save(refs)
}, (app) => {
  // DOWN: revert to the connection/stage-only participant rules (drop global clause).
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`

  const forms = app.findCollectionByNameOrId("tools_forms")
  const formsParticipantRule = `
    ${participantInProject("workflow_id.project_id")} &&
    (
      (connection_id != "" && ${roleCheck("connection_id.allowed_roles")}) ||
      (stage_id != "" && ${roleCheck("allowed_roles")})
    )
  `
  forms.listRule = `workflow_id.project_id.owner_id = @request.auth.id || (${formsParticipantRule})`
  forms.viewRule = `workflow_id.project_id.owner_id = @request.auth.id || (${formsParticipantRule})`
  app.save(forms)

  const refs = app.findCollectionByNameOrId("tools_form_field_refs")
  const refsParticipantRule = `
    ${participantInProject("form_id.workflow_id.project_id")} &&
    (
      (form_id.connection_id != "" && ${roleCheck("form_id.connection_id.allowed_roles")}) ||
      (form_id.stage_id != "" && ${roleCheck("form_id.allowed_roles")})
    )
  `
  refs.listRule = `form_id.workflow_id.project_id.owner_id = @request.auth.id || (${refsParticipantRule})`
  refs.viewRule = `form_id.workflow_id.project_id.owner_id = @request.auth.id || (${refsParticipantRule})`
  app.save(refs)
})
