// pb_migrations/1768800002_field_values_entry_permission.js
// Fixes: Allow users with entry permission to create field values
// Problem: workflow_instance_field_values CREATE rule only checked current_stage_id.visible_to_roles,
// but workflow_instances CREATE checks entry_allowed_roles. These are independent, so users with
// entry permission but no stage 1 visibility could create instances but not field values.

migrate((app) => {
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`

  const collection = app.findCollectionByNameOrId("workflow_instance_field_values")
  if (collection) {
    // CREATE: Check current stage visibility OR entry permission
    // - Stage visibility: allows transition form data to be saved
    // - Entry permission: allows creating instance + field values without needing stage visibility
    collection.createRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")}
          && (${roleCheck("instance_id.current_stage_id.visible_to_roles")}
              || ${roleCheck("instance_id.workflow_id.entry_allowed_roles")}))
    `
    app.save(collection)
  }
}, (app) => {
  // DOWN: Revert to previous rule (stage visibility only)
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`

  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`

  const collection = app.findCollectionByNameOrId("workflow_instance_field_values")
  if (collection) {
    collection.createRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("instance_id.workflow_id.project_id")}
          && ${roleCheck("instance_id.current_stage_id.visible_to_roles")})
    `
    app.save(collection)
  }
})
