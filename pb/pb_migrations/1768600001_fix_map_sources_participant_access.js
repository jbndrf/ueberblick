// pb_migrations/1768600001_fix_map_sources_participant_access.js
// Fix map_sources rules to only allow participants to see sources used by map_layers they can access
// Uses @collection.map_layers to check if there's a layer using this source that the participant can see

migrate((app) => {
  const collection = app.findCollectionByNameOrId("map_sources")
  if (collection) {
    // Participant can view a source if:
    // - There exists a map_layer that uses this source (source_id = id)
    // - That layer belongs to their project
    // - They have role access to that layer (empty visible_to_roles = all roles, or their role is in the list)
    const participantRule = `(
      @request.auth.collectionName = "participants" &&
      @collection.map_layers.source_id = id &&
      @collection.map_layers.project_id = @request.auth.project_id &&
      (@collection.map_layers.visible_to_roles:length = 0 || @collection.map_layers.visible_to_roles ?= @request.auth.role_id)
    )`

    const newRule = `owner_id = @request.auth.id || ${participantRule}`

    collection.listRule = newRule
    collection.viewRule = newRule
    // create/update/delete remain owner-only (unchanged)

    app.save(collection)
    console.log("Updated map_sources rules to scope participant access via map_layers")
  }
}, (app) => {
  // Revert to old overly-permissive rule
  const collection = app.findCollectionByNameOrId("map_sources")
  if (collection) {
    const oldRule = `owner_id = @request.auth.id || @request.auth.collectionName = "participants"`
    collection.listRule = oldRule
    collection.viewRule = oldRule
    app.save(collection)
  }
})
