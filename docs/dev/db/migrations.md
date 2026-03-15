# Database Migrations

PocketBase v0.35+ uses JavaScript migrations in `pb/pb_migrations/`.

## File Naming

```
{unix_timestamp}_{description}.js
```

Timestamps are 10-digit Unix epoch values. Use a rough convention where larger numbers run later. Examples from the codebase:

| Timestamp | File |
|-----------|------|
| `1736563200` | `create_projects.js` |
| `1768150004` | `restructure_map_tables.js` |
| `1776100000` | `add_workflow_visible_to_roles.js` |

## Basic Structure

Every migration has an **up** function and a **down** function:

```javascript
migrate((app) => {
  // UP: apply changes
}, (app) => {
  // DOWN: revert changes
})
```

## Pattern 1: Create a Collection

```javascript
migrate((app) => {
  const collection = new Collection({
    type: "base",           // "base" or "auth"
    name: "projects",
    listRule: "owner_id = @request.auth.id",
    viewRule: "owner_id = @request.auth.id",
    createRule: "@request.auth.id != ''",
    updateRule: "owner_id = @request.auth.id",
    deleteRule: "owner_id = @request.auth.id",
    fields: [
      { name: "name", type: "text", required: true, max: 255 },
      { name: "description", type: "text", max: 1000 },
      { name: "owner_id", type: "relation", required: true,
        collectionId: "_pb_users_auth_", maxSelect: 1 },
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
```

### Auth collections

Set `type: "auth"` and configure auth options:

```javascript
const collection = new Collection({
  type: "auth",
  name: "participants",
  // ...fields, rules...
  passwordAuth: {
    enabled: true,
    identityFields: ["token"],
  },
  emailAuth: {
    enabled: false,
  },
  indexes: [
    "CREATE UNIQUE INDEX idx_participants_token ON participants (token)",
  ],
})
```

## Pattern 2: Add a Field to an Existing Collection

Use `collection.fields.add(new Field({...}))`:

```javascript
migrate((app) => {
  const collection = app.findCollectionByNameOrId("workflows")

  collection.fields.add(new Field({
    name: "entry_allowed_roles",
    type: "relation",
    collectionId: rolesId,
    maxSelect: 99,
    required: false,
  }))

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("workflows")
  collection.fields.removeByName("entry_allowed_roles")
  app.save(collection)
})
```

## Pattern 3: Modify an Existing Field

Get the field by name and change its properties:

```javascript
migrate((app) => {
  const collection = app.findCollectionByNameOrId("tools_edit")
  const field = collection.fields.getByName("editable_fields")
  if (field) {
    field.required = false
  }
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("tools_edit")
  const field = collection.fields.getByName("editable_fields")
  if (field) {
    field.required = true
  }
  app.save(collection)
})
```

To update a select field's values:

```javascript
const fieldTypeField = collection.fields.find(f => f.name === "field_type")
if (fieldTypeField) {
  fieldTypeField.values = ["short_text", "long_text", "number", "email",
    "date", "file", "dropdown", "multiple_choice", "smart_dropdown",
    "custom_table_selector"]
}
app.save(collection)
```

## Pattern 4: Replace a Field (Change Type)

Remove the old field by index, then add the new one:

```javascript
migrate((app) => {
  const collection = app.findCollectionByNameOrId("markers")

  // Remove old JSON field
  const fieldIndex = collection.fields.findIndex(f => f.name === "location")
  if (fieldIndex !== -1) {
    collection.fields.splice(fieldIndex, 1)
  }

  // Add new geoPoint field
  collection.fields.add(new Field({
    name: "location",
    type: "geoPoint",
    required: false,
  }))

  app.save(collection)
}, (app) => {
  // Revert: replace geoPoint with JSON
  const collection = app.findCollectionByNameOrId("markers")
  const fieldIndex = collection.fields.findIndex(f => f.name === "location")
  if (fieldIndex !== -1) {
    collection.fields.splice(fieldIndex, 1)
  }
  collection.fields.add(new Field({
    name: "location",
    type: "json",
    required: false,
  }))
  app.save(collection)
})
```

## Pattern 5: Update API Rules

```javascript
migrate((app) => {
  const collection = app.findCollectionByNameOrId("roles")
  collection.listRule = "project_id.owner_id = @request.auth.id"
  collection.viewRule = "project_id.owner_id = @request.auth.id"
  collection.createRule = "project_id.owner_id = @request.auth.id"
  collection.updateRule = "project_id.owner_id = @request.auth.id"
  collection.deleteRule = "project_id.owner_id = @request.auth.id"
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("roles")
  collection.listRule = "@request.auth.id != ''"
  collection.viewRule = "@request.auth.id != ''"
  // ...
  app.save(collection)
})
```

## Pattern 6: Remove Fields

```javascript
// By name
collection.fields.removeByName("my_field")

// By ID (get reference first)
const field = collection.fields.getByName("my_field")
if (field) {
  collection.fields.removeById(field.id)
}

// By index
collection.fields.splice(fieldIndex, 1)

// Filter out multiple fields
collection.fields = collection.fields.filter(f => !["name", "is_default"].includes(f.name))
```

## Field Types Reference

| Type | Key Properties | Example |
|------|---------------|---------|
| `text` | `required`, `min`, `max`, `pattern` | `{ name: "table_name", type: "text", required: true, min: 1, max: 100, pattern: "^[a-z][a-z0-9_]*$" }` |
| `number` | `required`, `min`, `max` | `{ name: "progress", type: "number", min: 0, max: 100 }` |
| `bool` | `required` | `{ name: "is_active", type: "bool" }` |
| `date` | `required` | `{ name: "expires_at", type: "date" }` |
| `select` | `values`, `maxSelect`, `required` | `{ name: "status", type: "select", values: ["draft", "ready"], maxSelect: 1 }` |
| `relation` | `collectionId`, `maxSelect`, `cascadeDelete`, `required` | See below |
| `file` | `maxSelect`, `maxSize`, `protected` | `{ name: "files", type: "file", maxSelect: 99, maxSize: 10485760 }` |
| `json` | `maxSize` | `{ name: "config", type: "json", maxSize: 100000 }` |
| `geoPoint` | `required` | `{ name: "location", type: "geoPoint" }` |
| `autodate` | `onCreate`, `onUpdate` | `{ name: "created", type: "autodate", onCreate: true }` |

**All field properties are TOP-LEVEL on the Field object, NOT nested in `options`.**

Wrong:
```javascript
new Field({ name: "status", type: "select", options: { values: ["a", "b"] } })
```

Correct:
```javascript
new Field({ name: "status", type: "select", values: ["a", "b"], maxSelect: 1 })
```

## Relation Fields

Use the collection **ID**, not the collection name. Two ways to get it:

```javascript
// Dynamic lookup (preferred for new collections created in same migration)
const projectsId = app.findCollectionByNameOrId("projects").id

// Special built-in ID
collectionId: "_pb_users_auth_"  // built-in users collection
```

Single relation vs multi-relation:

```javascript
// Single relation (foreign key)
{ name: "project_id", type: "relation", collectionId: projectsId, maxSelect: 1 }

// Multi-relation (many-to-many)
{ name: "visible_to_roles", type: "relation", collectionId: rolesId, maxSelect: 99 }
```

## API Rules Reference

| Value | Meaning |
|-------|---------|
| `null` | No API access (operation disabled) |
| `""` (empty string) | Public access (no auth required) |
| `"@request.auth.id != ''"` | Any authenticated user |
| `"owner_id = @request.auth.id"` | Owner only |
| `"project_id.owner_id = @request.auth.id"` | Owner via relation traversal |

### Multi-relation array comparison

When checking if a user's multi-relation field contains a value from another multi-relation field, use `.id` on both sides:

```javascript
// Wrong -- fails silently
`@request.auth.role_id ?= visible_to_roles`

// Correct
`@request.auth.role_id.id ?= visible_to_roles.id`
```

### "Empty = all" convention

When a roles field is empty, it means all roles have access:

```javascript
const roleCheck = (rolesField) =>
  `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`
```

### Back-relation syntax

To check records in another collection that reference the current one:

```javascript
// From map_sources, check map_layers that reference it via source_id:
`map_layers_via_source_id.project_id ?= @request.auth.project_id`
```

## Applying Migrations

Restart PocketBase. Migrations run automatically on startup.

```bash
npm run backend
```

## Troubleshooting

**"The relation collection doesn't exist"** -- You used the collection name instead of the ID. Look up the ID:

```bash
sqlite3 pb/pb_data/data.db "SELECT id, name FROM _collections;"
```

**404 / "Missing collection context"** -- The collection does not exist. Verify the migration file is in `pb/pb_migrations/` and PocketBase was restarted.

**Migration not applied** -- Check the migration log:

```bash
sqlite3 pb/pb_data/data.db "SELECT * FROM _migrations;"
```

**Multi-relation filter not working** -- Use `.id` on both sides of `?=` comparisons. See the "Multi-relation array comparison" section above.
