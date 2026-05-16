// pb_migrations/1778300000_role_instance_quota.js
//
// Per-role quota on workflow_instance creation:
//   - roles.max_instances  number  – max workflow_instances any participant
//                                    in this role may have. 0 / empty = unlimited.
//
// Enforced server-side by pb_hooks/participant_instance_quota.pb.js.

migrate(
  (app) => {
    const roles = app.findCollectionByNameOrId("roles")
    if (roles.fields.findIndex((f) => f.name === "max_instances") === -1) {
      roles.fields.add(
        new Field({ name: "max_instances", type: "number", required: false, min: 0 })
      )
    }
    app.save(roles)
  },
  (app) => {
    const roles = app.findCollectionByNameOrId("roles")
    if (roles) {
      const i = roles.fields.findIndex((f) => f.name === "max_instances")
      if (i !== -1) roles.fields.splice(i, 1)
      app.save(roles)
    }
  }
)
