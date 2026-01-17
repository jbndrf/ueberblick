// pb_migrations/1768800000_add_workflow_entry_roles.js
// Add entry_allowed_roles field to workflows collection.
// This field controls which roles can CREATE new workflow instances.
// When entry connection is saved in workflow builder, its allowed_roles
// are synced to this field for efficient PocketBase rule enforcement.
migrate((app) => {
  const rolesId = app.findCollectionByNameOrId("roles").id
  const collection = app.findCollectionByNameOrId("workflows")

  if (!collection) {
    console.log("workflows collection not found")
    return
  }

  // Check if field already exists
  const existingField = collection.fields.getByName("entry_allowed_roles")
  if (existingField) {
    console.log("entry_allowed_roles field already exists")
    return
  }

  // Add entry_allowed_roles field using the proper Field API
  collection.fields.add(new Field({
    name: "entry_allowed_roles",
    type: "relation",
    collectionId: rolesId,
    maxSelect: 99,
    required: false
  }))

  app.save(collection)
  console.log("Added entry_allowed_roles field to workflows collection")

}, (app) => {
  // DOWN: Remove the field
  const collection = app.findCollectionByNameOrId("workflows")

  if (!collection) return

  collection.fields.removeByName("entry_allowed_roles")
  app.save(collection)
})
