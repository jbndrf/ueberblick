// pb_migrations/1736563200_create_projects.js
migrate((app) => {
  let collection = new Collection({
    type: "base",
    name: "projects",
    listRule: "owner_id = @request.auth.id",
    viewRule: "owner_id = @request.auth.id",
    createRule: "@request.auth.id != ''",
    updateRule: "owner_id = @request.auth.id",
    deleteRule: "owner_id = @request.auth.id",
    fields: [
      { name: "name", type: "text", required: true, max: 255 },
      { name: "description", type: "text", max: 1000 },
      { name: "owner_id", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1 },
      { name: "is_active", type: "bool" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  })
  app.save(collection)
}, (app) => {
  let collection = app.findCollectionByNameOrId("projects")
  app.delete(collection)
})
