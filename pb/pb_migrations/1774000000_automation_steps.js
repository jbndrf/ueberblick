// pb_migrations/1774000000_automation_steps.js
// Replace flat conditions+actions with sequential steps array on tools_automation.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("tools_automation")

  // Remove old fields
  const conditionsField = collection.fields.getByName("conditions")
  if (conditionsField) collection.fields.removeById(conditionsField.id)

  const actionsField = collection.fields.getByName("actions")
  if (actionsField) collection.fields.removeById(actionsField.id)

  // Add steps field
  collection.fields.add(new Field({
    name: "steps",
    type: "json",
    required: true,
  }))

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("tools_automation")

  // Remove steps
  const stepsField = collection.fields.getByName("steps")
  if (stepsField) collection.fields.removeById(stepsField.id)

  // Restore conditions and actions
  collection.fields.add(new Field({
    name: "conditions",
    type: "json",
    required: false,
  }))
  collection.fields.add(new Field({
    name: "actions",
    type: "json",
    required: true,
  }))

  app.save(collection)
})
