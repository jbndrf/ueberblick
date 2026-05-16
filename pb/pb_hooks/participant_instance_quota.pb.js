/// <reference path="../pb_data/types.d.ts" />

// Per-role quota on workflow_instance creation.
//
// roles.max_instances caps how many workflow_instances any participant
// holding that role may have (counted live via `created_by = <participant>`).
// 0 / empty = unlimited. Admin (`users`) auth bypasses entirely.
// Deletions free the count.
//
// Multi-role participant: the MOST PERMISSIVE non-zero cap across their
// roles wins. If no role has a positive max_instances, the participant is
// unlimited.

onRecordCreateRequest((e) => {
  try {
    // Resolve auth. In PB JSVM, `e.auth` is the authenticated record on
    // record-event hooks. Fall back to requestInfo() defensively.
    var auth = e.auth;
    if (!auth) {
      try {
        var info = e.requestInfo();
        auth = info && info.auth;
      } catch (_) { /* nop */ }
    }
    if (!auth) {
      console.log("[instance_quota] no auth -- skipping");
      return e.next();
    }

    var collName = "";
    try { collName = auth.collection().name; } catch (_) {}
    if (collName !== "participants") {
      // Admin or other auth -- never enforce.
      return e.next();
    }

    var participantId = auth.id;

    var roleIds = auth.get("role_id");
    if (!roleIds) roleIds = [];
    if (!Array.isArray(roleIds)) roleIds = [roleIds];
    if (roleIds.length === 0) {
      console.log("[instance_quota] participant " + participantId + " has no roles -- skipping");
      return e.next();
    }

    var max = 0;
    var anyPositive = false;
    for (var i = 0; i < roleIds.length; i++) {
      try {
        var r = $app.findRecordById("roles", roleIds[i]);
        var v = r.getInt("max_instances") || 0;
        if (v > 0) {
          anyPositive = true;
          if (v > max) max = v;
        }
      } catch (err) { /* role not found -- skip */ }
    }
    if (!anyPositive) {
      return e.next(); // no role caps anything -> unlimited
    }

    var existing = $app.findRecordsByFilter(
      "workflow_instances",
      "created_by = {:p}",
      "",
      max + 1,
      0,
      { p: participantId }
    );

    console.log(
      "[instance_quota] participant=" + participantId +
      " max=" + max + " used=" + existing.length
    );

    if (existing.length >= max) {
      throw new BadRequestError("quota_exceeded:instances");
    }

    e.next();
  } catch (err) {
    // Re-throw any quota rejection so PB returns 400 to the caller.
    // Match on the message because PB's JSVM BadRequestError doesn't
    // reliably set err.name to "BadRequestError".
    var msg = "";
    try { msg = String((err && (err.message || err.toString())) || ""); } catch (_) {}
    if (msg.toLowerCase().indexOf("quota_exceeded") !== -1) {
      throw err;
    }
    console.error("[instance_quota] unexpected error:", err);
    e.next(); // fail open on truly unexpected errors
  }
}, "workflow_instances");
