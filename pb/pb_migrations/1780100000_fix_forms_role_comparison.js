// pb_migrations/1780100000_fix_forms_role_comparison.js
// Repair: 1780000000 re-set the tools_forms / tools_form_field_refs participant
// rules with a bare multi-relation comparison (`@request.auth.role_id ?= field`),
// which never matches because participants.role_id is maxSelect:99 (an array).
// PocketBase requires the `.id ?= ....id` form to compare two relation arrays —
// the same bug already fixed once in 1768700000. Re-apply the rules with the
// correct comparison so role-gated forms and field refs become visible again.
migrate((app) => {
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`

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
  // DOWN: restore the broken bare comparison that 1780000000 originally set.
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id ?= ${rolesField})`

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
})
