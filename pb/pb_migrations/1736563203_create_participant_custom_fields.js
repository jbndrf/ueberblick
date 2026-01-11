// pb_migrations/1736563203_create_participant_custom_fields.js
migrate((app) => {
  const projectsCollection = app.findCollectionByNameOrId("projects")

  let collection = new Collection({
    type: "base",
    name: "participant_custom_fields",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      { name: "project_id", type: "relation", required: true, collectionId: projectsCollection.id, maxSelect: 1 },
      { name: "field_name", type: "text", required: true, max: 255 },
      { name: "field_type", type: "select", required: true, values: ["text", "number", "date", "boolean"], maxSelect: 1 },
      { name: "is_required", type: "bool" },
      { name: "default_value", type: "text", max: 1000 },
      { name: "display_order", type: "number", min: 0 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_pcf_project_field ON participant_custom_fields (project_id, field_name)",
    ],
  })
  app.save(collection)
}, (app) => {
  let collection = app.findCollectionByNameOrId("participant_custom_fields")
  app.delete(collection)
})
