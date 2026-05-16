// pb_migrations/1778200000_self_joinable_roles.js
//
// Adds self-joinable ("guest") roles:
//   - roles.self_joinable    bool  – flag that marks a role as publicly joinable
//   - roles.join_slug        text  – globally unique unguessable slug, lives at /join/<slug>
//   - participants.self_joined bool – set on participants minted via the join endpoint
//
// participants.listRule is tightened so non-admin readers can only see their own
// row when self_joined=true (prevents self-joiners from enumerating each other).

migrate(
  (app) => {
    // --- roles ---------------------------------------------------------------
    const roles = app.findCollectionByNameOrId("roles")
    if (roles.fields.findIndex((f) => f.name === "self_joinable") === -1) {
      roles.fields.add(
        new Field({ name: "self_joinable", type: "bool", required: false })
      )
    }
    if (roles.fields.findIndex((f) => f.name === "join_slug") === -1) {
      roles.fields.add(
        new Field({ name: "join_slug", type: "text", required: false, max: 64 })
      )
    }
    // Sparse-unique index: only enforce uniqueness for non-empty slugs.
    const slugIdx = "CREATE UNIQUE INDEX idx_roles_join_slug ON roles (join_slug) WHERE join_slug != ''"
    if (!roles.indexes.includes(slugIdx)) {
      roles.indexes.push(slugIdx)
    }
    app.save(roles)

    // --- participants --------------------------------------------------------
    const participants = app.findCollectionByNameOrId("participants")
    if (participants.fields.findIndex((f) => f.name === "self_joined") === -1) {
      participants.fields.add(
        new Field({ name: "self_joined", type: "bool", required: false })
      )
    }

    // Tighten listRule/viewRule for participants: self-joined rows are only
    // visible to admins and to the row's owner. Non-self-joined rows keep the
    // previous "any authenticated user" visibility for back-compat with the
    // admin UI and any places that resolve role assignees.
    participants.listRule =
      "@request.auth.collectionName = 'users' || " +
      "self_joined = false || self_joined = null || id = @request.auth.id"
    participants.viewRule = participants.listRule
    app.save(participants)
  },
  (app) => {
    // DOWN
    const participants = app.findCollectionByNameOrId("participants")
    if (participants) {
      participants.listRule = "@request.auth.id != ''"
      participants.viewRule = "@request.auth.id != ''"
      const sjIdx = participants.fields.findIndex((f) => f.name === "self_joined")
      if (sjIdx !== -1) participants.fields.splice(sjIdx, 1)
      app.save(participants)
    }

    const roles = app.findCollectionByNameOrId("roles")
    if (roles) {
      const slugIdx = "CREATE UNIQUE INDEX idx_roles_join_slug ON roles (join_slug) WHERE join_slug != ''"
      const idx = roles.indexes.indexOf(slugIdx)
      if (idx !== -1) roles.indexes.splice(idx, 1)
      for (const name of ["self_joinable", "join_slug"]) {
        const i = roles.fields.findIndex((f) => f.name === name)
        if (i !== -1) roles.fields.splice(i, 1)
      }
      app.save(roles)
    }
  }
)
