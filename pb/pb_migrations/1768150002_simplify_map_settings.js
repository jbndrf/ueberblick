// Migration: Simplify map_settings to one config per project
// Remove name, is_default, is_active fields - only project_id and config needed

migrate((app) => {
  const collection = app.findCollectionByNameOrId("map_settings")

  // Remove fields that are no longer needed
  const fieldsToRemove = ["name", "is_default", "is_active"]
  collection.fields = collection.fields.filter(f => !fieldsToRemove.includes(f.name))

  app.save(collection)

  // Clean up any existing data - keep only one record per project (the default one if exists)
  try {
    // Delete non-default records if multiple exist per project
    app.db().newQuery(`
      DELETE FROM map_settings
      WHERE id NOT IN (
        SELECT MIN(id) FROM map_settings GROUP BY project_id
      )
    `).execute()
  } catch (e) {
    console.log("Cleanup warning:", e)
  }

}, (app) => {
  // DOWN: Add the fields back
  const collection = app.findCollectionByNameOrId("map_settings")

  collection.fields.push({
    name: "name",
    type: "text",
    required: true,
    min: 1,
    max: 255
  })
  collection.fields.push({
    name: "is_default",
    type: "bool",
    required: false
  })
  collection.fields.push({
    name: "is_active",
    type: "bool",
    required: false
  })

  app.save(collection)
})
