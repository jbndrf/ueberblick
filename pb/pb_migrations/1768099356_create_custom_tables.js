// Migration: Create custom tables system
// Collections: custom_tables, custom_table_columns, custom_table_data

migrate((app) => {
  // 1. Create custom_tables collection
  const customTables = new Collection({
    type: "base",
    name: "custom_tables",

    // Owner can manage, participant access will be added via admin UI later
    listRule: "project_id.owner_id = @request.auth.id",
    viewRule: "project_id.owner_id = @request.auth.id",
    createRule: "@request.auth.id != ''",
    updateRule: "project_id.owner_id = @request.auth.id",
    deleteRule: "project_id.owner_id = @request.auth.id",

    fields: [
      {
        name: "project_id",
        type: "relation",
        required: true,
        collectionId: "pbc_484305853", // projects
        maxSelect: 1,
        cascadeDelete: false
      },
      {
        name: "table_name",
        type: "text",
        required: true,
        min: 1,
        max: 100,
        pattern: "^[a-z][a-z0-9_]*$"
      },
      {
        name: "display_name",
        type: "text",
        required: true,
        min: 1,
        max: 255
      },
      {
        name: "description",
        type: "text",
        required: false,
        max: 1000
      },
      {
        name: "main_column",
        type: "text",
        required: true,
        min: 1,
        max: 100,
        pattern: "^[a-z][a-z0-9_]*$"
      },
      {
        name: "sort_order",
        type: "number",
        required: false,
        min: 0
      },
      {
        name: "visible_to_roles",
        type: "relation",
        required: false,
        collectionId: "pbc_2105053228", // roles
        maxSelect: 999 // multi-select
      },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ]
  })
  app.save(customTables)

  // Get the ID of the newly created custom_tables collection
  const customTablesCollection = app.findCollectionByNameOrId("custom_tables")
  const customTablesId = customTablesCollection.id

  // 2. Create custom_table_columns collection
  const customTableColumns = new Collection({
    type: "base",
    name: "custom_table_columns",

    listRule: "table_id.project_id.owner_id = @request.auth.id",
    viewRule: "table_id.project_id.owner_id = @request.auth.id",
    createRule: "table_id.project_id.owner_id = @request.auth.id",
    updateRule: "table_id.project_id.owner_id = @request.auth.id",
    deleteRule: "table_id.project_id.owner_id = @request.auth.id",

    fields: [
      {
        name: "table_id",
        type: "relation",
        required: true,
        collectionId: customTablesId,
        maxSelect: 1,
        cascadeDelete: true
      },
      {
        name: "column_name",
        type: "text",
        required: true,
        min: 1,
        max: 100,
        pattern: "^[a-z][a-z0-9_]*$"
      },
      {
        name: "column_type",
        type: "select",
        required: true,
        values: ["text", "number", "date", "boolean"],
        maxSelect: 1
      },
      {
        name: "is_required",
        type: "bool",
        required: false
      },
      {
        name: "default_value",
        type: "text",
        required: false,
        max: 1000
      },
      {
        name: "sort_order",
        type: "number",
        required: false,
        min: 0
      },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ]
  })
  app.save(customTableColumns)

  // 3. Create custom_table_data collection
  const customTableData = new Collection({
    type: "base",
    name: "custom_table_data",

    listRule: "table_id.project_id.owner_id = @request.auth.id",
    viewRule: "table_id.project_id.owner_id = @request.auth.id",
    createRule: "table_id.project_id.owner_id = @request.auth.id",
    updateRule: "table_id.project_id.owner_id = @request.auth.id",
    deleteRule: "table_id.project_id.owner_id = @request.auth.id",

    fields: [
      {
        name: "table_id",
        type: "relation",
        required: true,
        collectionId: customTablesId,
        maxSelect: 1,
        cascadeDelete: true
      },
      {
        name: "row_data",
        type: "json",
        required: true,
        maxSize: 100000 // 100KB max per row
      },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ]
  })
  app.save(customTableData)

}, (app) => {
  // DOWN: Delete collections in reverse order
  try {
    const customTableData = app.findCollectionByNameOrId("custom_table_data")
    app.delete(customTableData)
  } catch (e) {}

  try {
    const customTableColumns = app.findCollectionByNameOrId("custom_table_columns")
    app.delete(customTableColumns)
  } catch (e) {}

  try {
    const customTables = app.findCollectionByNameOrId("custom_tables")
    app.delete(customTables)
  } catch (e) {}
})
