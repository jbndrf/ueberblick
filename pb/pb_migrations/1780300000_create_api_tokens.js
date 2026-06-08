// pb_migrations/1780300000_create_api_tokens.js
//
// api_tokens: admin-issued, read-only personal access tokens used by external
// GIS clients (QGIS) to pull a project's data as GeoJSON. The raw token is
// shown to the admin once and never stored -- only its sha256 hash lives here.
//
// The QGIS read path looks a token up by hash with a SUPERUSER client (which
// bypasses these rules), then impersonates `user_id` so the actual data reads
// run as that SECTOR admin under the normal owner_id rules. These collection
// rules only govern an admin managing their OWN tokens from the SECTOR UI.
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "api_tokens",

    // Owner-only: an admin (users record) sees and manages only their own tokens.
    listRule: 'user_id = @request.auth.id && @request.auth.collectionName = "users"',
    viewRule: 'user_id = @request.auth.id && @request.auth.collectionName = "users"',
    createRule: 'user_id = @request.auth.id && @request.auth.collectionName = "users"',
    updateRule: 'user_id = @request.auth.id && @request.auth.collectionName = "users"',
    deleteRule: 'user_id = @request.auth.id && @request.auth.collectionName = "users"',

    fields: [
      {
        name: "user_id",
        type: "relation",
        required: true,
        collectionId: "_pb_users_auth_", // users
        maxSelect: 1,
        cascadeDelete: true
      },
      {
        // Optional scope: null = every project this admin owns.
        name: "project_id",
        type: "relation",
        required: false,
        collectionId: "pbc_484305853", // projects
        maxSelect: 1,
        cascadeDelete: true
      },
      { name: "label", type: "text", required: false, max: 255 },
      // sha256 hex of the raw token (`ubk_<base64url(32 bytes)>`). The raw token
      // is never persisted.
      { name: "token_hash", type: "text", required: true, min: 64, max: 64 },
      // Last 4 chars of the raw token, for disambiguating in the UI.
      { name: "last_four", type: "text", required: false, max: 8 },
      { name: "expires_at", type: "date", required: false },
      { name: "last_used_at", type: "date", required: false },
      { name: "revoked", type: "bool", required: false },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ],

    indexes: [
      "CREATE UNIQUE INDEX idx_api_tokens_token_hash ON api_tokens (token_hash)",
      "CREATE INDEX idx_api_tokens_user ON api_tokens (user_id)"
    ]
  })

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("api_tokens")
  app.delete(collection)
})
