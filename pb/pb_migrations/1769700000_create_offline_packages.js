// pb_migrations/1769700000_create_offline_packages.js
// Creates offline_packages collection for admin-managed tile packages

migrate((app) => {
  const projectsId = app.findCollectionByNameOrId("projects").id
  const mapLayersId = app.findCollectionByNameOrId("map_layers").id
  const usersId = app.findCollectionByNameOrId("users").id

  // Helper for participant project check
  const participantInProject = `(@request.auth.collectionName = "participants" && project_id = @request.auth.project_id)`

  const offlinePackages = new Collection({
    type: "base",
    name: "offline_packages",

    // Admin: full access to all packages in their projects
    // Participant: read-only access to 'ready' packages in their project
    listRule: `project_id.owner_id = @request.auth.id || (${participantInProject} && status = "ready")`,
    viewRule: `project_id.owner_id = @request.auth.id || (${participantInProject} && status = "ready")`,
    createRule: "project_id.owner_id = @request.auth.id",
    updateRule: "project_id.owner_id = @request.auth.id",
    deleteRule: "project_id.owner_id = @request.auth.id",

    fields: [
      {
        name: "name",
        type: "text",
        required: true,
        min: 1,
        max: 255
      },
      {
        name: "project_id",
        type: "relation",
        required: true,
        collectionId: projectsId,
        maxSelect: 1,
        cascadeDelete: true
      },
      {
        name: "region_geojson",
        type: "json",
        required: true,
        maxSize: 500000 // GeoJSON polygon can be large
      },
      {
        name: "zoom_min",
        type: "number",
        required: false,
        min: 0,
        max: 22
      },
      {
        name: "zoom_max",
        type: "number",
        required: false,
        min: 0,
        max: 22
      },
      {
        name: "layers",
        type: "relation",
        required: false,
        collectionId: mapLayersId,
        maxSelect: 99,
        cascadeDelete: false
      },
      {
        name: "status",
        type: "select",
        required: true,
        values: ["draft", "processing", "ready", "failed"],
        maxSelect: 1
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
      {
        name: "file_size_bytes",
        type: "number",
        required: false,
        min: 0
      },
      {
        name: "archive_file",
        type: "file",
        required: false,
        maxSelect: 1,
        maxSize: 1073741824 // 1GB max for tile archives
      },
      {
        name: "created_by",
        type: "relation",
        required: false,
        collectionId: usersId,
        maxSelect: 1,
        cascadeDelete: false
      },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ]
  })

  app.save(offlinePackages)
  console.log("Created offline_packages collection")

}, (app) => {
  // DOWN: Delete collection
  try {
    const collection = app.findCollectionByNameOrId("offline_packages")
    app.delete(collection)
    console.log("Deleted offline_packages collection")
  } catch (e) {
    console.log("Could not delete offline_packages:", e)
  }
})
