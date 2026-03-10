// Allow participants to view their own record via the API.
// Needed for the entity selector's "participants" source type (self-select).
migrate((app) => {
  const collection = app.findCollectionByNameOrId("participants")

  const selfViewRule = 'project_id.owner_id = @request.auth.id || (@request.auth.collectionName = "participants" && id = @request.auth.id)'
  collection.listRule = selfViewRule
  collection.viewRule = selfViewRule

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("participants")

  const adminOnlyRule = 'project_id.owner_id = @request.auth.id'
  collection.listRule = adminOnlyRule
  collection.viewRule = adminOnlyRule

  app.save(collection)
})
