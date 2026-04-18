// pb_migrations/1777200000_multi_geometry_workflow_instances.js
// Enables line and polygon workflow instances alongside points.
//
// workflows:           + geometry_type (select: point|line|polygon)
// workflow_instances:  - location (geoPoint, replaced)
//                      + geometry (json, GeoJSON geometry)
//                      + centroid (geoPoint, derived)
//                      + bbox     (json, { minLon, minLat, maxLon, maxLat }, derived)
//
// No backwards compatibility: the app is under construction and the user has
// confirmed existing workflow_instances data can be dropped.

migrate((app) => {
  // --- workflows: add geometry_type ---
  let workflows = app.findCollectionByNameOrId("workflows")
  if (workflows) {
    if (workflows.fields.findIndex(f => f.name === "geometry_type") === -1) {
      workflows.fields.add(new Field({
        name: "geometry_type",
        type: "select",
        required: true,
        values: ["point", "line", "polygon"],
        maxSelect: 1,
      }))
      app.save(workflows)

      // Default existing workflows to "point" so they keep working.
      const rows = app.findAllRecords("workflows")
      for (let i = 0; i < rows.length; i++) {
        if (!rows[i].get("geometry_type")) {
          rows[i].set("geometry_type", "point")
          app.unsafeWithoutHooks().save(rows[i])
        }
      }
    }
  }

  // --- workflow_instances: drop location, add geometry / centroid / bbox ---
  let instances = app.findCollectionByNameOrId("workflow_instances")
  if (instances) {
    const locIdx = instances.fields.findIndex(f => f.name === "location")
    if (locIdx !== -1) {
      instances.fields.splice(locIdx, 1)
    }

    if (instances.fields.findIndex(f => f.name === "geometry") === -1) {
      instances.fields.add(new Field({
        name: "geometry",
        type: "json",
        required: false,
      }))
    }

    if (instances.fields.findIndex(f => f.name === "centroid") === -1) {
      instances.fields.add(new Field({
        name: "centroid",
        type: "geoPoint",
        required: false,
      }))
    }

    if (instances.fields.findIndex(f => f.name === "bbox") === -1) {
      instances.fields.add(new Field({
        name: "bbox",
        type: "json",
        required: false,
      }))
    }

    app.save(instances)
  }

}, (app) => {
  // DOWN: restore location geoPoint, drop geometry/centroid/bbox and geometry_type
  let instances = app.findCollectionByNameOrId("workflow_instances")
  if (instances) {
    ["geometry", "centroid", "bbox"].forEach((name) => {
      const idx = instances.fields.findIndex(f => f.name === name)
      if (idx !== -1) instances.fields.splice(idx, 1)
    })

    if (instances.fields.findIndex(f => f.name === "location") === -1) {
      instances.fields.add(new Field({
        name: "location",
        type: "geoPoint",
        required: false,
      }))
    }
    app.save(instances)
  }

  let workflows = app.findCollectionByNameOrId("workflows")
  if (workflows) {
    const idx = workflows.fields.findIndex(f => f.name === "geometry_type")
    if (idx !== -1) {
      workflows.fields.splice(idx, 1)
      app.save(workflows)
    }
  }
})
