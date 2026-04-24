// Geometry helpers for workflow_instances derived fields.
//
// Not loaded as a hook (no .pb.js suffix). Required at runtime from
// workflow_instance_geometry.pb.js inside each hook callback, because
// PocketBase evaluates hook callbacks in isolated Goja VMs that do not
// inherit file-level scope from the .pb.js file itself -- top-level
// function declarations in that file are not visible to the callback
// body. (This is the root cause of the "applyDerived is not defined"
// ReferenceError that showed up in production logs.)

function applyDerived(record) {
  var auto = require(`${__hooks}/automation.js`);
  var raw = record.get("geometry");
  if (!raw) return;

  var geom = auto.parseJsonField(raw);
  if (!geom || typeof geom !== "object" || !geom.type) return;

  var coords = flattenCoords(geom);
  if (coords.length === 0) return;

  var minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  var sumLon = 0, sumLat = 0;
  for (var i = 0; i < coords.length; i++) {
    var lon = coords[i][0];
    var lat = coords[i][1];
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
  record.set("bbox", { minLon: minLon, minLat: minLat, maxLon: maxLon, maxLat: maxLat });
}

// Flatten GeoJSON coordinates to a flat array of [lon, lat] pairs.
// Supports Point, LineString, MultiLineString, Polygon, MultiPolygon.
// For polygons we use the outer ring only (holes don't affect centroid/bbox
// in a useful way for clustering).
function flattenCoords(geom) {
  if (!geom || !geom.coordinates) return [];

  if (geom.type === "Point") {
    var c = geom.coordinates;
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
    var out2 = [];
    for (var k = 0; k < geom.coordinates.length; k++) {
      var poly = geom.coordinates[k];
      if (!Array.isArray(poly) || poly.length === 0) continue;
      var ring = ringFlat(poly[0]);
      for (var m = 0; m < ring.length; m++) out2.push(ring[m]);
    }
    return out2;
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

module.exports = { applyDerived: applyDerived };
