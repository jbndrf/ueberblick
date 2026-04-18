// pb_migrations/1777300000_participant_enabled_features.js
// Add enabled_features JSON field to participants — stores the list of opt-in
// power features a participant has turned on (e.g. "filter.field_filters").
// Features are off by default; the UI treats missing/empty as "no extras".
migrate((app) => {
  const participants = app.findCollectionByNameOrId("participants")
  if (!participants) return

  participants.fields.add(new Field({
    name: "enabled_features",
    type: "json",
    required: false,
  }))

  app.save(participants)
}, (app) => {
  const participants = app.findCollectionByNameOrId("participants")
  if (!participants) return

  const field = participants.fields.getByName("enabled_features")
  if (field) participants.fields.removeById(field.id)

  app.save(participants)
})
