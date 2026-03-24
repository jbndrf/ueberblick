// Make created_by optional on workflow_instances for admin-imported instances
migrate((app) => {
  const collection = app.findCollectionByNameOrId("workflow_instances")
  const field = collection.fields.getByName("created_by")
  field.required = false
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("workflow_instances")
  const field = collection.fields.getByName("created_by")
  field.required = true
  app.save(collection)
})
