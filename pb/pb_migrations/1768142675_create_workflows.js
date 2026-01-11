// pb_migrations/1768142675_create_workflows.js
migrate((app) => {
  let collection = new Collection({
    type: "base",
    name: "workflows",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      { name: "project_id", type: "relation", required: true, collectionId: "pbc_484305853", maxSelect: 1, cascadeDelete: true },
      { name: "name", type: "text", required: true, max: 255 },
      { name: "description", type: "text", max: 1000 },
      { name: "workflow_type", type: "select", required: true, values: ["incident", "survey"], maxSelect: 1 },
      { name: "marker_color", type: "text", max: 7 },
      { name: "icon_config", type: "json" },
      { name: "is_active", type: "bool" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  })
  app.save(collection)
}, (app) => {
  let collection = app.findCollectionByNameOrId("workflows")
  app.delete(collection)
})
