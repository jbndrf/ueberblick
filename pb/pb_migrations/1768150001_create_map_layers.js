// Migration: Create map_layers collection with SpatiaLite geometry support

migrate((app) => {
  const projectsCollection = app.findCollectionByNameOrId("projects")
  const rolesCollection = app.findCollectionByNameOrId("roles")

  // Create map_layers collection
  const mapLayers = new Collection({
    type: "base",
    name: "map_layers",

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
        name: "name",
        type: "text",
        required: true,
        min: 1,
        max: 255
      },
      {
        name: "layer_type",
        type: "select",
        required: true,
        values: ["tile", "wms", "geojson", "custom"],
        maxSelect: 1
      },
      {
        name: "url",
        type: "text",
        required: false,
        max: 2000
      },
      {
        name: "config",
        type: "json",
        required: false,
        maxSize: 100000 // {attribution, opacity, min_zoom, max_zoom, style, wms_layers, ...}
      },
      {
        name: "display_order",
        type: "number",
        required: false,
        min: 0
      },
      {
        name: "visible_to_roles",
        type: "relation",
        required: false,
        collectionId: rolesCollection.id,
        maxSelect: 99, // Multi-select relation
        cascadeDelete: false
      },
      {
        name: "is_base_layer",
        type: "bool",
        required: false
      },
      {
        name: "is_active",
        type: "bool",
        required: false
      },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ]
  })
  app.save(mapLayers)

  // Add SpatiaLite geometry column for bounds (optional polygon for layer extent)
  try {
    app.db().newQuery("SELECT AddGeometryColumn('map_layers', 'bounds', 4326, 'POLYGON', 'XY')").execute()
    app.db().newQuery("SELECT CreateSpatialIndex('map_layers', 'bounds')").execute()
  } catch (e) {
    console.log("SpatiaLite geometry setup warning:", e)
  }

}, (app) => {
  // DOWN: Delete collection
  try {
    app.db().newQuery("SELECT DisableSpatialIndex('map_layers', 'bounds')").execute()
    app.db().newQuery("DROP TABLE IF EXISTS idx_map_layers_bounds").execute()
  } catch (e) {}

  try {
    const mapLayers = app.findCollectionByNameOrId("map_layers")
    app.delete(mapLayers)
  } catch (e) {}
})
