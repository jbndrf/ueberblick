// Migration: Create map_settings collection with SpatiaLite geometry support
// One map_settings record per project (1:1 relationship)

migrate((app) => {
  const projectsCollection = app.findCollectionByNameOrId("projects")

  // Create map_settings collection
  const mapSettings = new Collection({
    type: "base",
    name: "map_settings",

    // Project owners can manage, authenticated users can view
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "project_id.owner_id = @request.auth.id",
    updateRule: "project_id.owner_id = @request.auth.id",
    deleteRule: "project_id.owner_id = @request.auth.id",

    fields: [
      {
        name: "project_id",
        type: "relation",
        required: true,
        collectionId: projectsCollection.id,
        maxSelect: 1,
        cascadeDelete: true
      },
      {
        name: "config",
        type: "json",
        required: false,
        maxSize: 50000 // {tile_url, attribution, default_zoom, min_zoom, max_zoom, center_lat, center_lng}
      },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ]
  })
  app.save(mapSettings)

  // Add SpatiaLite geometry column for default_center
  // MakePoint(longitude, latitude, 4326) - WGS84 coordinate system
  try {
    app.db().newQuery("SELECT AddGeometryColumn('map_settings', 'default_center', 4326, 'POINT', 'XY')").execute()
    app.db().newQuery("SELECT CreateSpatialIndex('map_settings', 'default_center')").execute()
  } catch (e) {
    console.log("SpatiaLite geometry setup warning:", e)
  }

}, (app) => {
  // DOWN: Delete collection (geometry column is dropped automatically)
  try {
    app.db().newQuery("SELECT DisableSpatialIndex('map_settings', 'default_center')").execute()
    app.db().newQuery("DROP TABLE IF EXISTS idx_map_settings_default_center").execute()
  } catch (e) {}

  try {
    const mapSettings = app.findCollectionByNameOrId("map_settings")
    app.delete(mapSettings)
  } catch (e) {}
})
