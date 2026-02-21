// pb_migrations/1773000000_update_automation_engine.js
// Updates automation engine:
// - Replace time_based with scheduled in trigger_type select
// - Add last_run_at field for cron double-execution prevention
migrate((app) => {
  const collection = app.findCollectionByNameOrId("tools_automation")

  // 1. Replace trigger_type values: time_based -> scheduled
  const triggerField = collection.fields.getByName("trigger_type")
  collection.fields.removeById(triggerField.id)
  collection.fields.add(new Field({
    name: "trigger_type",
    type: "select",
    required: true,
    values: ["on_transition", "on_field_change", "scheduled"],
    maxSelect: 1,
  }))

  // 2. Add last_run_at for tracking scheduled automation execution
  collection.fields.add(new Field({
    name: "last_run_at",
    type: "date",
    required: false,
  }))

  app.save(collection)

}, (app) => {
  const collection = app.findCollectionByNameOrId("tools_automation")

  // Restore trigger_type values
  const triggerField = collection.fields.getByName("trigger_type")
  collection.fields.removeById(triggerField.id)
  collection.fields.add(new Field({
    name: "trigger_type",
    type: "select",
    required: true,
    values: ["on_transition", "on_field_change", "time_based"],
    maxSelect: 1,
  }))

  // Remove last_run_at
  const lastRunField = collection.fields.getByName("last_run_at")
  if (lastRunField) {
    collection.fields.removeById(lastRunField.id)
  }

  app.save(collection)
})
