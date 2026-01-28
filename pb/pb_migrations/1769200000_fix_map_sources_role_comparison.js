// pb_migrations/1769200000_fix_map_sources_role_comparison.js
// Fix map_sources role comparison to use .id on both sides
// Per PocketBase docs: multi-relation array comparison requires .id syntax
// See: https://github.com/pocketbase/pocketbase/discussions/1817

migrate((app) => {
  const collection = app.findCollectionByNameOrId("map_sources")
  if (collection) {
    const participantRule = `(
      @request.auth.collectionName = "participants" &&
      map_layers_via_source_id.project_id ?= @request.auth.project_id &&
      (map_layers_via_source_id.visible_to_roles:length = 0 ||
       @request.auth.role_id.id ?= map_layers_via_source_id.visible_to_roles.id)
    )`

    const newRule = `owner_id = @request.auth.id || ${participantRule}`

    collection.listRule = newRule
    collection.viewRule = newRule

    app.save(collection)
    console.log("Fixed map_sources: role comparison now uses .id syntax")
  }
}, (app) => {
  // Revert to old syntax
  const collection = app.findCollectionByNameOrId("map_sources")
  if (collection) {
    const participantRule = `(
      @request.auth.collectionName = "participants" &&
      map_layers_via_source_id.project_id ?= @request.auth.project_id &&
      (map_layers_via_source_id.visible_to_roles:length = 0 ||
       map_layers_via_source_id.visible_to_roles ?= @request.auth.role_id)
    )`

    const newRule = `owner_id = @request.auth.id || ${participantRule}`

    collection.listRule = newRule
    collection.viewRule = newRule

    app.save(collection)
  }
})
