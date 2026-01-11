// Migration: Restructure map tables
// - Create map_sources (user-scoped tile/WMS/GeoJSON library with upload support)
// - Add source_id to map_layers
// - Drop map_settings (merged into base layer)

migrate((app) => {
  const usersCollection = app.findCollectionByNameOrId("users")
  const projectsCollection = app.findCollectionByNameOrId("projects")
  const rolesCollection = app.findCollectionByNameOrId("roles")

  // 1. Drop map_settings collection (no longer needed)
  try {
    app.db().newQuery("SELECT DisableSpatialIndex('map_settings', 'default_center')").execute()
    app.db().newQuery("DROP TABLE IF EXISTS idx_map_settings_default_center").execute()
  } catch (e) {}

  try {
    const mapSettings = app.findCollectionByNameOrId("map_settings")
    app.delete(mapSettings)
  } catch (e) {
    console.log("map_settings collection not found, skipping drop")
  }

  // 2. Create map_sources collection (user-scoped)
  const mapSources = new Collection({
    type: "base",
    name: "map_sources",

    // Owner can manage their own sources, authenticated users can view all
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "owner_id = @request.auth.id",
    deleteRule: "owner_id = @request.auth.id",

    fields: [
      {
        name: "owner_id",
        type: "relation",
        required: true,
        collectionId: usersCollection.id,
        maxSelect: 1
      },
      {
        name: "name",
        type: "text",
        required: true,
        min: 1,
        max: 255
      },
      {
        name: "source_type",
        type: "select",
        required: true,
        values: ["tile", "wms", "uploaded", "preset", "geojson"],
        maxSelect: 1
      },
      {
        name: "url",
        type: "text",
        required: false, // Not required for uploaded sources initially
        max: 2000
      },
      {
        name: "config",
        type: "json",
        required: false,
        maxSize: 100000
        // TileConfig: { attribution?, tile_format?, detected_min_zoom?, detected_max_zoom? }
        // WmsConfig: { attribution?, layers, format?, transparent?, version? }
        // GeoJsonConfig: { attribution?, style?, data? }
        // UploadConfig: { attribution?, tile_format }
      },
      // Upload processing fields
      {
        name: "status",
        type: "select",
        required: false,
        values: ["pending", "processing", "completed", "failed"],
        maxSelect: 1
      },
      {
        name: "progress",
        type: "number",
        required: false,
        min: 0,
        max: 100
      },
      {
        name: "error_message",
        type: "text",
        required: false,
        max: 5000
      },
      {
        name: "tile_count",
        type: "number",
        required: false,
        min: 0
      },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ]
  })
  app.save(mapSources)

  // 3. Drop existing map_layers and recreate with source_id
  try {
    app.db().newQuery("SELECT DisableSpatialIndex('map_layers', 'bounds')").execute()
    app.db().newQuery("DROP TABLE IF EXISTS idx_map_layers_bounds").execute()
  } catch (e) {}

  try {
    const oldMapLayers = app.findCollectionByNameOrId("map_layers")
    app.delete(oldMapLayers)
  } catch (e) {
    console.log("map_layers collection not found, skipping drop")
  }

  // 4. Create new map_layers with source_id reference
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
        name: "source_id",
        type: "relation",
        required: true,
        collectionId: mapSources.id,
        maxSelect: 1,
        cascadeDelete: false
      },
      {
        name: "name",
        type: "text",
        required: true,
        min: 1,
        max: 255
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
        maxSelect: 99,
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
      {
        name: "config",
        type: "json",
        required: false,
        maxSize: 50000
        // LayerConfig: { opacity?, min_zoom?, max_zoom?, default_zoom?, default_center? }
      },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ]
  })
  app.save(mapLayers)

  // Add SpatiaLite geometry column for bounds
  try {
    app.db().newQuery("SELECT AddGeometryColumn('map_layers', 'bounds', 4326, 'POLYGON', 'XY')").execute()
    app.db().newQuery("SELECT CreateSpatialIndex('map_layers', 'bounds')").execute()
  } catch (e) {
    console.log("SpatiaLite geometry setup warning:", e)
  }

}, (app) => {
  // DOWN: Revert to old structure
  try {
    app.db().newQuery("SELECT DisableSpatialIndex('map_layers', 'bounds')").execute()
    app.db().newQuery("DROP TABLE IF EXISTS idx_map_layers_bounds").execute()
  } catch (e) {}

  try {
    const mapLayers = app.findCollectionByNameOrId("map_layers")
    app.delete(mapLayers)
  } catch (e) {}

  try {
    const mapSources = app.findCollectionByNameOrId("map_sources")
    app.delete(mapSources)
  } catch (e) {}
})
