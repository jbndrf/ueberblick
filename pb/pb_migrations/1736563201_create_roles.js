// pb_migrations/1736563201_create_roles.js
migrate((app) => {
  const projectsCollection = app.findCollectionByNameOrId("projects")

  let collection = new Collection({
    type: "base",
    name: "roles",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      { name: "project_id", type: "relation", required: true, collectionId: projectsCollection.id, maxSelect: 1 },
      { name: "name", type: "text", required: true, max: 255 },
      { name: "description", type: "text", max: 1000 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  })
  app.save(collection)
}, (app) => {
  let collection = app.findCollectionByNameOrId("roles")
  app.delete(collection)
})
