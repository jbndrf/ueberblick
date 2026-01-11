// Migration: Create marker categories system
// Collections: marker_categories, markers

migrate((app) => {
  // 1. Create marker_categories collection
  const markerCategories = new Collection({
    type: "base",
    name: "marker_categories",

    // Users (project owners) can manage, participants can view
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "project_id.owner_id = @request.auth.id",
    deleteRule: "project_id.owner_id = @request.auth.id",

    fields: [
      {
        name: "project_id",
        type: "relation",
        required: true,
        collectionId: "pbc_484305853", // projects
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
        name: "description",
        type: "text",
        required: false,
        max: 1000
      },
      {
        name: "icon_config",
        type: "json",
        required: false,
        maxSize: 50000 // 50KB for icon config (includes SVG content)
      },
      {
        name: "visible_to_roles",
        type: "json",
        required: false,
        maxSize: 10000 // Array of role IDs
      },
      {
        name: "fields",
        type: "json",
        required: false,
        maxSize: 100000 // 100KB for field definitions
      },
      {
        name: "sort_order",
        type: "number",
        required: false,
        min: 0
      },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ]
  })
  app.save(markerCategories)

  // Get the ID of the newly created marker_categories collection
  const markerCategoriesCollection = app.findCollectionByNameOrId("marker_categories")
  const markerCategoriesId = markerCategoriesCollection.id

  // 2. Create markers collection
  const markers = new Collection({
    type: "base",
    name: "markers",

    // Users (project owners) can manage, participants can view/create markers
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "project_id.owner_id = @request.auth.id || created_by = @request.auth.id",
    deleteRule: "project_id.owner_id = @request.auth.id",

    fields: [
      {
        name: "project_id",
        type: "relation",
        required: true,
        collectionId: "pbc_484305853", // projects
        maxSelect: 1,
        cascadeDelete: false
      },
      {
        name: "category_id",
        type: "relation",
        required: true,
        collectionId: markerCategoriesId,
        maxSelect: 1,
        cascadeDelete: true
      },
      {
        name: "title",
        type: "text",
        required: true,
        min: 1,
        max: 500
      },
      {
        name: "description",
        type: "text",
        required: false,
        max: 5000
      },
      {
        name: "location",
        type: "json",
        required: true,
        maxSize: 1000 // GeoJSON Point: {"type": "Point", "coordinates": [lng, lat]}
      },
      {
        name: "properties",
        type: "json",
        required: false,
        maxSize: 100000 // 100KB for custom field values
      },
      {
        name: "visible_to_roles",
        type: "json",
        required: false,
        maxSize: 10000 // Array of role IDs
      },
      {
        name: "created_by",
        type: "relation",
        required: false,
        collectionId: "_pb_users_auth_", // users
        maxSelect: 1,
        cascadeDelete: false
      },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ]
  })
  app.save(markers)

}, (app) => {
  // DOWN: Delete collections in reverse order
  try {
    const markers = app.findCollectionByNameOrId("markers")
    app.delete(markers)
  } catch (e) {}

  try {
    const markerCategories = app.findCollectionByNameOrId("marker_categories")
    app.delete(markerCategories)
  } catch (e) {}
})
