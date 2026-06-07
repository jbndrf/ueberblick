// pb_migrations/1780200000_participants_token_duration.js
// Give participant sessions a 90-day auth-token lifetime. The token is renewed
// on every server-reached request by the auth hook (src/hooks.server.ts), so a
// participant who opens the app online even once a quarter stays signed in.
// Pair with the matching cookie maxAge in src/hooks.server.ts.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("participants")

  // 90 days = 90 * 24 * 60 * 60 seconds. Mutate only the duration so the
  // existing signing secret is preserved.
  collection.authToken.duration = 7776000

  app.save(collection)
}, (app) => {
  // Revert to PocketBase's default auth-token duration (7 days).
  const collection = app.findCollectionByNameOrId("participants")

  collection.authToken.duration = 604800

  app.save(collection)
})
