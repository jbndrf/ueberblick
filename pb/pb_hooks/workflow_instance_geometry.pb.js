/// <reference path="../pb_data/types.d.ts" />

// Derive `centroid` (geoPoint) and `bbox` ({minLon,minLat,maxLon,maxLat}) from
// the `geometry` GeoJSON object on workflow_instances create/update.
//
// The app reads geometry for rendering, but centroid+bbox power:
//   - Supercluster point clustering (centroid marker for lines/polygons)
//   - Cheap "instances inside this viewport / area" SQL filtering (bbox)
//
// Keeping derivation in a hook means clients don't need to compute these and
// can't get out of sync. JSON-type fields in PocketBase v0.35 return byte
// arrays from record.get(); we reuse parseJsonField from automation.js.

onRecordCreateRequest((e) => {
  try {
    if (e.record && e.record.collection().name === "workflow_instances") {
      applyDerived(e.record);
    }
  } catch (err) { console.error("[geometry hook] create:", err); }
  e.next();
});

onRecordUpdateRequest((e) => {
  try {
    if (e.record && e.record.collection().name === "workflow_instances") {
      applyDerived(e.record);
    }
  } catch (err) { console.error("[geometry hook] update:", err); }
  e.next();
});

function applyDerived(record) {
  const raw = record.get("geometry");
  if (!raw) return;

  const auto = require(`${__hooks}/automation.js`);
  const geom = auto.parseJsonField(raw);

  if (!geom || typeof geom !== "object" || !geom.type) return;

  const coords = flattenCoords(geom);
  if (coords.length === 0) return;

  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  let sumLon = 0, sumLat = 0;
  for (let i = 0; i < coords.length; i++) {
    const lon = coords[i][0];
    const lat = coords[i][1];
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
    sumLon += lon;
    sumLat += lat;
  }

  record.set("centroid", {
    lon: sumLon / coords.length,
    lat: sumLat / coords.length,
  });
  record.set("bbox", { minLon, minLat, maxLon, maxLat });
}

// Flatten GeoJSON coordinates to a flat array of [lon, lat] pairs.
// Supports Point, LineString, MultiLineString, Polygon, MultiPolygon.
// For polygons we use the outer ring only (holes don't affect centroid/bbox
// in a useful way for clustering).
function flattenCoords(geom) {
  if (!geom || !geom.coordinates) return [];

  if (geom.type === "Point") {
    const c = geom.coordinates;
    return (Array.isArray(c) && c.length >= 2) ? [[c[0], c[1]]] : [];
  }

  if (geom.type === "LineString") {
    return Array.isArray(geom.coordinates) ? geom.coordinates.slice() : [];
  }

  if (geom.type === "MultiLineString") {
    if (!Array.isArray(geom.coordinates)) return [];
    var out = [];
    for (var i = 0; i < geom.coordinates.length; i++) {
      var line = geom.coordinates[i];
      if (!Array.isArray(line)) continue;
      for (var j = 0; j < line.length; j++) out.push(line[j]);
    }
    return out;
  }

  if (geom.type === "Polygon") {
    var rings = geom.coordinates;
    if (!Array.isArray(rings) || rings.length === 0) return [];
    return ringFlat(rings[0]);
  }

  if (geom.type === "MultiPolygon") {
    if (!Array.isArray(geom.coordinates)) return [];
    var out = [];
    for (var i = 0; i < geom.coordinates.length; i++) {
      var poly = geom.coordinates[i];
      if (!Array.isArray(poly) || poly.length === 0) continue;
      var ring = ringFlat(poly[0]);
      for (var j = 0; j < ring.length; j++) out.push(ring[j]);
    }
    return out;
  }

  return [];
}

function ringFlat(outer) {
  if (!Array.isArray(outer) || outer.length === 0) return [];
  var first = outer[0];
  var last = outer[outer.length - 1];
  var closed =
    last && first && last[0] === first[0] && last[1] === first[1];
  return closed ? outer.slice(0, -1) : outer.slice();
}
