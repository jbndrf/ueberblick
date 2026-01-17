// pb_migrations/1768500001_fix_project_participant_access.js
// Allow participants to view the project they belong to
migrate((app) => {
  const collection = app.findCollectionByNameOrId("projects")
  if (collection) {
    // Owner can do everything, participants can view their own project
    collection.listRule = `owner_id = @request.auth.id || (@request.auth.collectionName = "participants" && id = @request.auth.project_id)`
    collection.viewRule = `owner_id = @request.auth.id || (@request.auth.collectionName = "participants" && id = @request.auth.project_id)`
    // create/update/delete remain owner-only
    app.save(collection)
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId("projects")
  if (collection) {
    collection.listRule = "owner_id = @request.auth.id"
    collection.viewRule = "owner_id = @request.auth.id"
    app.save(collection)
  }
})
