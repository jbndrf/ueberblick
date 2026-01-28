// pb_migrations/1769100001_fix_map_sources_via_syntax.js
// Fix map_sources rules - use correct back-relation syntax
//
// The correct PocketBase syntax for back-relations is:
//   collectionName_via_relationField
// NOT:
//   @collection.collectionName.field
//
// From map_sources, to check map_layers that reference it via source_id:
//   map_layers_via_source_id.field
//
// See: https://pocketbase.io/docs/working-with-relations/ (Back-relations section)

migrate((app) => {
  const collection = app.findCollectionByNameOrId("map_sources")
  if (collection) {
    // Participant can view a source if:
    // - There exists ANY map_layer that uses this source (via source_id back-relation)
    // - That layer belongs to their project
    // - They have role access to that layer (or layer is visible to all roles)
    const participantRule = `(
      @request.auth.collectionName = "participants" &&
      map_layers_via_source_id.project_id ?= @request.auth.project_id &&
      (map_layers_via_source_id.visible_to_roles:length = 0 || map_layers_via_source_id.visible_to_roles ?= @request.auth.role_id)
    )`

    const newRule = `owner_id = @request.auth.id || ${participantRule}`

    collection.listRule = newRule
    collection.viewRule = newRule
    // create/update/delete remain owner-only (unchanged)

    app.save(collection)
    console.log("Fixed map_sources rules: using map_layers_via_source_id back-relation syntax")
  }
}, (app) => {
  // Revert to simple participant rule
  const collection = app.findCollectionByNameOrId("map_sources")
  if (collection) {
    collection.listRule = '@request.auth.collectionName = "participants"'
    collection.viewRule = '@request.auth.collectionName = "participants"'
    app.save(collection)
  }
})
