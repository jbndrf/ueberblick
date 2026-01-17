// pb_migrations/1768500000_migrate_to_geopoint.js
// Migrate location fields from JSON to native PocketBase GeoPointField
// This removes dependency on SpatiaLite for location storage
migrate((app) => {
  // Migrate markers.location from JSON to geoPoint
  let collection = app.findCollectionByNameOrId("markers")
  if (collection) {
    const fieldIndex = collection.fields.findIndex(f => f.name === "location")
    if (fieldIndex !== -1) {
      collection.fields.splice(fieldIndex, 1)
    }

    collection.fields.add(new Field({
      name: "location",
      type: "geoPoint",
      required: false,
    }))

    app.save(collection)
  }

  // Migrate workflow_instances.location from JSON to geoPoint
  collection = app.findCollectionByNameOrId("workflow_instances")
  if (collection) {
    const fieldIndex = collection.fields.findIndex(f => f.name === "location")
    if (fieldIndex !== -1) {
      collection.fields.splice(fieldIndex, 1)
    }

    collection.fields.add(new Field({
      name: "location",
      type: "geoPoint",
      required: false,
    }))

    app.save(collection)
  }

}, (app) => {
  // DOWN: Revert to JSON fields
  let collection = app.findCollectionByNameOrId("markers")
  if (collection) {
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
  }

  collection = app.findCollectionByNameOrId("workflow_instances")
  if (collection) {
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
  }
})
