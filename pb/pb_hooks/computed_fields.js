/// <reference path="../pb_data/types.d.ts" />

// Phase 2 — first-class computed fields.
//
// Listens for any change to workflow_field_values; finds every computed
// field_def that depends (via compute_depends_on) on the changed def; re-
// evaluates each dependent's compute_expression using the automation engine;
// upserts the result into workflow_field_values as a singleton-shaped row
// (write_mode = "computed").
//
// Loop-safety: writes through unsafeWithoutHooks so the recompute doesn't
// re-fire this hook on itself. A bounded recursion limit (MAX_DEPTH) catches
// any indirect cycles that the admin save-time topological check missed.
//
// Failures are logged to workflow_field_compute_log (best-effort, never throws
// to the parent write).

const MAX_RECOMPUTE_DEPTH = 5;

function recomputeDependents(changedFieldDefId, instanceId, depth) {
  if (depth > MAX_RECOMPUTE_DEPTH) {
    console.warn("[ComputedFields] Recompute depth exceeded for field " + changedFieldDefId);
    return;
  }

  var auto;
  try {
    auto = require(`${__hooks}/automation.js`);
  } catch (err) {
    console.error("[ComputedFields] Failed to load automation.js:", err);
    return;
  }

  // Find every computed def that lists the changed def in its compute_depends_on.
  var dependents = [];
  try {
    dependents = $app.findRecordsByFilter(
      "workflow_field_defs",
      'write_mode = "computed" && compute_depends_on.id ?= {:depId}',
      "",
      200,
      0,
      { depId: changedFieldDefId }
    );
  } catch (err) {
    // No matches or filter error — nothing to recompute.
    return;
  }

  if (dependents.length === 0) return;

  var noHooksApp = $app.unsafeWithoutHooks();
  var nowIso = new Date().toISOString();

  for (var i = 0; i < dependents.length; i++) {
    var def = dependents[i];
    var defId = def.id;
    var expression = def.get("compute_expression") || "";

    if (!expression.trim()) {
      // No expression yet — skip silently.
      continue;
    }

    var resolved = null;
    var errMsg = null;

    try {
      // The expression engine evaluates field refs via lookupFieldValue,
      // which already routes singleton/computed/observation correctly.
      resolved = auto.evaluateExpression(expression, instanceId);
    } catch (err) {
      errMsg = "" + err;
      console.warn(
        "[ComputedFields] Recompute failed for def=" + defId + " instance=" + instanceId + ": " + errMsg
      );
    }

    // Always log (success or failure) — debugging "why is this empty" needs both.
    try {
      var logCollection = $app.findCollectionByNameOrId("workflow_field_compute_log");
      if (logCollection) {
        var logRecord = new Record(logCollection);
        logRecord.set("instance_id", instanceId);
        logRecord.set("field_def_id", defId);
        logRecord.set("expression", expression);
        logRecord.set("result", resolved === null ? "" : String(resolved));
        logRecord.set("error", errMsg || "");
        logRecord.set("computed_at", nowIso);
        $app.save(logRecord);
      }
    } catch (logErr) {
      // Logging is best-effort — don't let it block the recompute.
    }

    if (errMsg !== null) continue;

    // Upsert the computed value as a singleton-shaped row.
    var stageId = def.get("display_stage_id") || "";
    if (!stageId) {
      try {
        var inst = $app.findRecordById("workflow_instances", instanceId);
        stageId = inst.get("current_stage_id");
      } catch (err) { /* leave blank */ }
    }

    var existing = [];
    try {
      existing = $app.findRecordsByFilter(
        "workflow_field_values",
        'instance_id = {:instId} && field_def_id = {:fdId}',
        "",
        1,
        0,
        { instId: instanceId, fdId: defId }
      );
    } catch (err) { /* none */ }

    try {
      if (existing.length > 0) {
        var rec = existing[0];
        rec.set("value", String(resolved));
        rec.set("recorded_at", nowIso);
        rec.set("recorded_at_stage", stageId);
        noHooksApp.save(rec);
      } else {
        var coll = $app.findCollectionByNameOrId("workflow_field_values");
        var rec2 = new Record(coll);
        rec2.set("instance_id", instanceId);
        rec2.set("field_def_id", defId);
        rec2.set("write_mode", "computed");
        rec2.set("value", String(resolved));
        rec2.set("recorded_at", nowIso);
        rec2.set("recorded_at_stage", stageId);
        // Computed writes still go through the create-hook (we want the
        // on_field_change automations to fire on the new derived value, and
        // we want this very hook to cascade further computed dependencies).
        $app.save(rec2);
      }
    } catch (writeErr) {
      console.error("[ComputedFields] Failed to write computed value def=" + defId + ":", writeErr);
      continue;
    }

    // Cascade: this just-written computed value may itself be referenced by
    // another computed def. Recurse with bumped depth.
    recomputeDependents(defId, instanceId, depth + 1);
  }
}

function onFieldValueChange(e) {
  var instanceId = e.record.get("instance_id");
  var fieldDefId = e.record.get("field_def_id");
  if (instanceId && fieldDefId) {
    try {
      recomputeDependents(fieldDefId, instanceId, 0);
    } catch (err) {
      // Never let a compute failure break the parent write.
      console.error("[ComputedFields] Hook error:", err);
    }
  }
  e.next();
}

onRecordAfterCreateSuccess(onFieldValueChange, "workflow_field_values");
onRecordAfterUpdateSuccess(onFieldValueChange, "workflow_field_values");
