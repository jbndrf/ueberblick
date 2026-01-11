// pb_migrations/1736563202_create_participants.js
migrate((app) => {
  const projectsCollection = app.findCollectionByNameOrId("projects")
  const rolesCollection = app.findCollectionByNameOrId("roles")

  let collection = new Collection({
    type: "auth",
    name: "participants",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      { name: "project_id", type: "relation", required: true, collectionId: projectsCollection.id, maxSelect: 1 },
      { name: "name", type: "text", required: true, max: 255 },
      { name: "phone", type: "text", max: 50 },
      { name: "token", type: "text", required: true },
      { name: "is_active", type: "bool" },
      { name: "expires_at", type: "date" },
      { name: "last_active", type: "date" },
      { name: "role_id", type: "relation", collectionId: rolesCollection.id, maxSelect: 99 },
      { name: "metadata", type: "json" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_participants_token ON participants (token)",
    ],
    // Auth options: allow login with token field
    passwordAuth: {
      enabled: true,
      identityFields: ["token"],
    },
    // Email is not required for participants (we use placeholder emails)
    emailAuth: {
      enabled: false,
    },
  })
  app.save(collection)
}, (app) => {
  let collection = app.findCollectionByNameOrId("participants")
  app.delete(collection)
})
