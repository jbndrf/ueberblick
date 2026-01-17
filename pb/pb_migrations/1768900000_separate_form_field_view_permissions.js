// pb_migrations/1768900000_separate_form_field_view_permissions.js
// Separate view vs fill permissions for form fields:
// - tools_forms: Keep role-based restrictions (who can FILL forms)
// - tools_form_fields: Allow viewing by any project participant (for displaying labels)
//
// This fixes the issue where participants couldn't see field labels for data
// submitted by others, even though they could see the field values.

migrate((app) => {
  // ============================================
  // Update tools_form_fields - allow viewing by any project participant
  // Form field definitions (labels, types) are metadata, not sensitive data.
  // Anyone who can view workflow instances should be able to see field labels.
  // ============================================
  const collection = app.findCollectionByNameOrId("tools_form_fields")
  if (collection) {
    // Simple rule: admin OR participant in project
    const viewRule = `
      form_id.workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants" && form_id.workflow_id.project_id = @request.auth.project_id)
    `

    collection.listRule = viewRule
    collection.viewRule = viewRule
    // Create/update/delete remain admin-only (unchanged)
    app.save(collection)
  }

}, (app) => {
  // DOWN: Restore role-based restrictions from previous migration
  const collection = app.findCollectionByNameOrId("tools_form_fields")
  if (collection) {
    const participantInProject = (projectPath) =>
      `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

    const roleCheck = (rolesField) =>
      `(${rolesField}:length = 0 || @request.auth.role_id ?= ${rolesField})`

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
})
