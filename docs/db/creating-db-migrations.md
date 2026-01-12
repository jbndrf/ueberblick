# Creating Database Migrations

This document describes the workflow for creating PocketBase collections alongside frontend pages.
wE ARE ONLY WORKIN WITHIN PUNKTSTUDIO CODE. WE LOOK AT ITS CODE AND ITS DATABASE. NOT ANY OTHER STUFF. DONT READ FORM OLDER REFERENCE PROJECT SOMEWHERE ELSE THAN /PUNKTSTUDIO... THIS IS ALL WE NEED

## Important Context

- We are working in **punktstudio** project
- Database location: `/home/jan/aktuell_10.jan.26/punktstudio/pb/pb_data/data.db`
- NOT the shared pocketbase at `/home/jan/pocketbase/`
aktuell_10.jan.26/punktstudio
## Collaboration Approach

Before jumping into implementation, **discuss the database design with the user**. This means:

1. Present options and trade-offs (e.g., separate tables vs JSON, unified vs dedicated)
2. Ask clarifying questions about requirements
3. Let the user make architectural decisions
4. Iterate on the schema through back-and-forth discussion
5. Only create tables/migrations after agreement

Do NOT assume the existing frontend code dictates the final schema - we may restructure both the database AND the frontend incrementally.

## Workflow Overview

1. **Discuss the schema first** - explore options, trade-offs, and alternatives with the user
2. **Examine the frontend page** to understand what fields it expects (but be open to restructuring)
3. **Agree on the final structure** before writing any code
4. **Create the migration file** in `pb/pb_migrations/` (or create tables directly if iterating)
5. **Restart PocketBase** to apply the migration

## Migration File Format

PocketBase v0.35+ uses JavaScript migrations in `pb/pb_migrations/`.

### File Naming Convention

```
{timestamp}_{description}.js
```

Example: `1736563200_create_projects.js`

### Basic Structure

```javascript
// pb_migrations/{timestamp}_{description}.js
migrate((app) => {
  // UP: Create collection
  let collection = new Collection({
    type: "base",  // or "auth" for user collections
    name: "your_collection",

    // RLS Rules (null = no access, "" = public access)
    listRule: "owner_id = @request.auth.id",
    viewRule: "owner_id = @request.auth.id",
    createRule: "@request.auth.id != ''",
    updateRule: "owner_id = @request.auth.id",
    deleteRule: "owner_id = @request.auth.id",

    // Field definitions
    fields: [
      { name: "field_name", type: "text", required: true, max: 255 },
      // ... more fields
    ],
  })
  app.save(collection)
}, (app) => {
  // DOWN: Delete collection
  let collection = app.findCollectionByNameOrId("your_collection")
  app.delete(collection)
})
```

## Field Types

| Type | Options | Example |
|------|---------|---------|
| `text` | `required`, `min`, `max` | `{ name: "title", type: "text", required: true, max: 255 }` |
| `editor` | `required`, `maxSize` | `{ name: "content", type: "editor", maxSize: 50000 }` |
| `number` | `required`, `min`, `max` | `{ name: "count", type: "number", min: 0 }` |
| `bool` | - | `{ name: "is_active", type: "bool" }` |
| `email` | `required` | `{ name: "email", type: "email", required: true }` |
| `url` | `required` | `{ name: "website", type: "url" }` |
| `date` | `required`, `min`, `max` | `{ name: "due_date", type: "date" }` |
| `select` | `values`, `maxSelect` | `{ name: "status", type: "select", values: ["draft", "published"], maxSelect: 1 }` |
| `relation` | `collectionId`, `maxSelect`, `cascadeDelete` | See below |
| `file` | `maxSelect`, `maxSize`, `mimeTypes` | See below |
| `json` | `maxSize` | `{ name: "metadata", type: "json" }` |
| `autodate` | `onCreate`, `onUpdate` | `{ name: "created", type: "autodate", onCreate: true }` |

### Relation Field

```javascript
{
  name: "owner_id",
  type: "relation",
  required: true,
  collectionId: "_pb_users_auth_",  // Use actual collection ID, not name!
  maxSelect: 1,
  cascadeDelete: false
}
```

**Important**: For relations, use the actual collection ID (e.g., `_pb_users_auth_` for users), not the collection name.

To find a collection ID:
```bash
sqlite3 pb/pb_data/data.db "SELECT id, name FROM _collections;"
```

### File Field

```javascript
{
  name: "cover",
  type: "file",
  maxSelect: 1,
  maxSize: 5242880,  // 5MB in bytes
  mimeTypes: ["image/jpeg", "image/png", "image/webp"]
}
```

## Autodate Fields (created/updated)

PocketBase does NOT automatically add `created` and `updated` fields. You MUST define them explicitly using the `autodate` type:

```javascript
fields: [
  // ... your other fields
  { name: "created", type: "autodate", onCreate: true },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
]
```

The `id` field is auto-generated, but `created` and `updated` require explicit definition.

## RLS (Row Level Security) Rules

Rules use PocketBase's filter syntax:

| Rule | Purpose | Common Patterns |
|------|---------|-----------------|
| `listRule` | Who can list records | `"owner_id = @request.auth.id"` |
| `viewRule` | Who can view a single record | `"owner_id = @request.auth.id"` |
| `createRule` | Who can create records | `"@request.auth.id != ''"` (any authenticated user) |
| `updateRule` | Who can update records | `"owner_id = @request.auth.id"` |
| `deleteRule` | Who can delete records | `"owner_id = @request.auth.id"` |

Special values:
- `null` - No access (API disabled)
- `""` (empty string) - Public access (no auth required)

### Common RLS Patterns

**Owner-only access:**
```javascript
listRule: "owner_id = @request.auth.id",
viewRule: "owner_id = @request.auth.id",
createRule: "@request.auth.id != ''",
updateRule: "owner_id = @request.auth.id",
deleteRule: "owner_id = @request.auth.id",
```

**Public read, authenticated write:**
```javascript
listRule: "",
viewRule: "",
createRule: "@request.auth.id != ''",
updateRule: "owner_id = @request.auth.id",
deleteRule: "owner_id = @request.auth.id",
```

## Applying Migrations

After creating a migration file:

```bash
# Restart PocketBase to apply migrations
npm run backend
```

Migrations run automatically on startup. Check the logs for:
```
[0.00ms] SELECT (1) FROM "_migrations" WHERE "file"='your_migration.js' LIMIT 1
```

## Example: Projects Collection

Frontend expects (`src/routes/(admin)/projects/new/+page.server.ts`):
- `name` - text, required, max 255
- `description` - text, optional, max 1000
- `owner_id` - relation to users
- `is_active` - bool

Migration (`pb/pb_migrations/1736563200_create_projects.js`):
```javascript
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
    ],
  })
  app.save(collection)
}, (app) => {
  let collection = app.findCollectionByNameOrId("projects")
  app.delete(collection)
})
```

## Troubleshooting

### "The relation collection doesn't exist"

You used the collection name instead of ID. Find the correct ID:
```bash
sqlite3 pb/pb_data/data.db "SELECT id, name FROM _collections WHERE name='users';"
```

### "Missing collection context" (404)

The collection doesn't exist. Check:
1. Migration file is in `pb/pb_migrations/`
2. PocketBase was restarted
3. No errors in PocketBase logs

### Check existing collections

```bash
sqlite3 pb/pb_data/data.db "SELECT id, name FROM _collections;"
```

### Check if migration was applied

```bash
sqlite3 pb/pb_data/data.db "SELECT * FROM _migrations;"
```
