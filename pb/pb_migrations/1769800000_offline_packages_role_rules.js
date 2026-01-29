// pb_migrations/1769800000_offline_packages_role_rules.js
// Adds role-based access control to offline_packages:
// 1. Add visible_to_roles multi-relation to roles
// 2. Set archive_file to protected (requires auth token to download)
// 3. Update list/view rules with role check

migrate((app) => {
  const collection = app.findCollectionByNameOrId("offline_packages")
  const rolesId = app.findCollectionByNameOrId("roles").id

  // Add visible_to_roles field (empty = all roles can access)
  collection.fields.add(new Field({
    name: "visible_to_roles",
    type: "relation",
    required: false,
    collectionId: rolesId,
    maxSelect: 99,
    cascadeDelete: false
  }))

  // Set archive_file to protected
  const archiveField = collection.fields.getByName("archive_file")
  archiveField.protected = true

  // Update list/view rules with role-based access
  const participantRule = `(
    @request.auth.collectionName = "participants"
    && project_id = @request.auth.project_id
    && status = "ready"
    && (visible_to_roles:length = 0 || @request.auth.role_id.id ?= visible_to_roles.id)
  )`

  collection.listRule = `project_id.owner_id = @request.auth.id || ${participantRule}`
  collection.viewRule = `project_id.owner_id = @request.auth.id || ${participantRule}`

  app.save(collection)
  console.log("Updated offline_packages: added visible_to_roles, protected archive_file, role-based rules")

}, (app) => {
  const collection = app.findCollectionByNameOrId("offline_packages")

  // Remove visible_to_roles field
  const field = collection.fields.getByName("visible_to_roles")
  if (field) {
    collection.fields.removeById(field.id)
  }

  // Unprotect archive_file
  const archiveField = collection.fields.getByName("archive_file")
  archiveField.protected = false

  // Restore original rules
  const participantInProject = `(@request.auth.collectionName = "participants" && project_id = @request.auth.project_id)`
  collection.listRule = `project_id.owner_id = @request.auth.id || (${participantInProject} && status = "ready")`
  collection.viewRule = `project_id.owner_id = @request.auth.id || (${participantInProject} && status = "ready")`

  app.save(collection)
  console.log("Reverted offline_packages role rules")
})
