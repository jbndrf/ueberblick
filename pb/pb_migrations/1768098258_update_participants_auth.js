// pb_migrations/1768098258_update_participants_auth.js
// Update participants auth collection to use token-based login
migrate((app) => {
  let collection = app.findCollectionByNameOrId("participants")

  // Configure password auth to use token field as identity
  collection.passwordAuth = {
    enabled: true,
    identityFields: ["token"],
  }

  // Disable email-based auth (we use placeholder emails)
  collection.emailAuth = {
    enabled: false,
  }

  // Add missing date fields if they don't exist
  const hasExpiresAt = collection.fields.find(f => f.name === "expires_at")
  if (!hasExpiresAt) {
    collection.fields.push({ name: "expires_at", type: "date" })
  }

  const hasLastActive = collection.fields.find(f => f.name === "last_active")
  if (!hasLastActive) {
    collection.fields.push({ name: "last_active", type: "date" })
  }

  app.save(collection)
}, (app) => {
  // Revert: restore default auth options
  let collection = app.findCollectionByNameOrId("participants")

  collection.passwordAuth = {
    enabled: true,
    identityFields: ["email", "username"],
  }

  collection.emailAuth = {
    enabled: true,
  }

  app.save(collection)
})
