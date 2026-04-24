/// <reference path="../pb_data/types.d.ts" />

// Derive `centroid` (geoPoint) and `bbox` ({minLon,minLat,maxLon,maxLat}) from
// the `geometry` GeoJSON object on workflow_instances create/update.
//
// The app reads geometry for rendering, but centroid+bbox power:
//   - Supercluster point clustering (centroid marker for lines/polygons)
//   - Cheap "instances inside this viewport / area" SQL filtering (bbox)
//
// Implementation note: hook callbacks run in isolated Goja VMs that do not
// inherit file-level scope. Helper functions must be loaded via require()
// from a non-.pb.js module inside each callback body -- see geometry.js.

onRecordCreateRequest((e) => {
  try {
    if (e.record && e.record.collection().name === "workflow_instances") {
      var geom = require(`${__hooks}/geometry.js`);
      geom.applyDerived(e.record);
    }
  } catch (err) { console.error("[geometry hook] create:", err); }
  e.next();
});

onRecordUpdateRequest((e) => {
  try {
    if (e.record && e.record.collection().name === "workflow_instances") {
      var geom = require(`${__hooks}/geometry.js`);
      geom.applyDerived(e.record);
    }
  } catch (err) { console.error("[geometry hook] update:", err); }
  e.next();
});
