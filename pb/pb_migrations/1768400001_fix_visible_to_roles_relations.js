// pb_migrations/1768400001_fix_visible_to_roles_relations.js
// Convert visible_to_roles from JSON to proper relation fields
migrate((app) => {
  const rolesCollection = app.findCollectionByNameOrId("roles")
  const rolesId = rolesCollection.id

  // Fix marker_categories - change visible_to_roles from JSON to relation
  let collection = app.findCollectionByNameOrId("marker_categories")
  if (collection) {
    // Find the index of the old JSON field and remove it
    const fieldIndex = collection.fields.findIndex(f => f.name === "visible_to_roles")
    if (fieldIndex !== -1) {
      collection.fields.splice(fieldIndex, 1)
    }

    // Add the new relation field using the add method
    collection.fields.add(new Field({
      name: "visible_to_roles",
      type: "relation",
      collectionId: rolesId,
      maxSelect: 99,
      required: false,
    }))

    // Update rules to use proper relation checks
    collection.listRule = `project_id.owner_id = @request.auth.id || (@request.auth.collectionName = "participants" && project_id = @request.auth.project_id && @request.auth.role_id ?= visible_to_roles)`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (@request.auth.collectionName = "participants" && project_id = @request.auth.project_id && @request.auth.role_id ?= visible_to_roles)`

    app.save(collection)
  }

  // Fix markers - change visible_to_roles from JSON to relation
  collection = app.findCollectionByNameOrId("markers")
  if (collection) {
    // Find the index of the old JSON field and remove it
    const fieldIndex = collection.fields.findIndex(f => f.name === "visible_to_roles")
    if (fieldIndex !== -1) {
      collection.fields.splice(fieldIndex, 1)
    }

    // Add the new relation field
    collection.fields.add(new Field({
      name: "visible_to_roles",
      type: "relation",
      collectionId: rolesId,
      maxSelect: 99,
      required: false,
    }))

    // Update rules with role-based visibility
    collection.listRule = `project_id.owner_id = @request.auth.id || (@request.auth.collectionName = "participants" && project_id = @request.auth.project_id && @request.auth.role_id ?= visible_to_roles)`
    collection.viewRule = `project_id.owner_id = @request.auth.id || (@request.auth.collectionName = "participants" && project_id = @request.auth.project_id && @request.auth.role_id ?= visible_to_roles)`
    collection.createRule = `project_id.owner_id = @request.auth.id || (@request.auth.collectionName = "participants" && project_id = @request.auth.project_id)`
    collection.updateRule = `project_id.owner_id = @request.auth.id || (@request.auth.collectionName = "participants" && project_id = @request.auth.project_id && @request.auth.role_id ?= visible_to_roles)`
    collection.deleteRule = `project_id.owner_id = @request.auth.id || (@request.auth.collectionName = "participants" && project_id = @request.auth.project_id && @request.auth.role_id ?= visible_to_roles)`

    app.save(collection)
  }

}, (app) => {
  // DOWN: Revert to JSON fields
  let collection = app.findCollectionByNameOrId("marker_categories")
  if (collection) {
    const fieldIndex = collection.fields.findIndex(f => f.name === "visible_to_roles")
    if (fieldIndex !== -1) {
      collection.fields.splice(fieldIndex, 1)
    }
    collection.fields.add(new Field({
      name: "visible_to_roles",
      type: "json",
      maxSize: 10000,
      required: false,
    }))
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("markers")
  if (collection) {
    const fieldIndex = collection.fields.findIndex(f => f.name === "visible_to_roles")
    if (fieldIndex !== -1) {
      collection.fields.splice(fieldIndex, 1)
    }
    collection.fields.add(new Field({
      name: "visible_to_roles",
      type: "json",
      maxSize: 10000,
      required: false,
    }))
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    collection.createRule = "project_id.owner_id = @request.auth.id"
    collection.updateRule = "project_id.owner_id = @request.auth.id"
    collection.deleteRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }
})
