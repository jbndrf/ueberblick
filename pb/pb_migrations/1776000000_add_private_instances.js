// Add private_instances boolean to workflows collection.
// When true, participants can only see their own workflow instances.
migrate((app) => {
  const workflows = app.findCollectionByNameOrId("workflows")

  // Add private_instances field
  workflows.fields.add(new Field({
    name: "private_instances",
    type: "bool",
    required: false,
  }))

  app.save(workflows)
}, (app) => {
  const workflows = app.findCollectionByNameOrId("workflows")
  workflows.fields.removeByName("private_instances")
  app.save(workflows)
})
