// Extending PocketBase with JS - @see https://pocketbase.io/docs/js-overview/
//
// IMPORTANT: PocketBase's goja VM isolates each hook callback in its own scope.
// Module-level functions are NOT accessible from inside handlers.
// All helpers live in automation.js and are loaded via require() per handler.

/// <reference path="../pb_data/types.d.ts" />

/**
 * Configure PocketBase on startup:
 * - Create first admin user from env vars if no users exist
 * - Configure batch API settings from env vars
 *
 * Environment variables:
 *   POCKETBASE_ADMIN_EMAIL        - Admin email for first user
 *   POCKETBASE_ADMIN_PASSWORD     - Admin password for first user
 *   PB_BATCH_ENABLED=true|false   - Enable/disable batch API
 *   PB_BATCH_MAX_REQUESTS=100     - Max operations per batch request
 *   PB_BATCH_TIMEOUT=30           - Timeout in seconds
 *   PB_BATCH_MAX_BODY_SIZE=134217728 - Max body size in bytes (128MB)
 */
onBootstrap((e) => {
  // Must call e.next() first before accessing database/settings
  e.next();

  // === Create first admin user if none exist ===
  const adminEmail = $os.getenv("POCKETBASE_ADMIN_EMAIL");
  const adminPassword = $os.getenv("POCKETBASE_ADMIN_PASSWORD");

  if (adminEmail && adminPassword) {
    try {
      const users = $app.findRecordsByFilter("users", "1=1", "", 1);

      if (users.length === 0) {
        const usersCollection = $app.findCollectionByNameOrId("users");
        const record = new Record(usersCollection);
        record.set("email", adminEmail);
        record.set("password", adminPassword);
        record.set("verified", true);
        record.set("name", "Admin");
        $app.save(record);
        console.log("[Config] First admin user created:", adminEmail);
      }
    } catch (err) {
      console.error("[Config] Failed to create first user:", err);
    }
  }

  // === Configure Batch API settings ===
  const settings = $app.settings();
  let hasChanges = false;

  const batchEnabled = $os.getenv("PB_BATCH_ENABLED");
  const batchMaxRequests = $os.getenv("PB_BATCH_MAX_REQUESTS");
  const batchTimeout = $os.getenv("PB_BATCH_TIMEOUT");
  const batchMaxBodySize = $os.getenv("PB_BATCH_MAX_BODY_SIZE");

  if (batchEnabled !== "") {
    const enabled = batchEnabled === "true" || batchEnabled === "1";
    if (settings.batch.enabled !== enabled) {
      settings.batch.enabled = enabled;
      hasChanges = true;
      console.log(`[Config] Batch API enabled: ${enabled}`);
    }
  }

  if (batchMaxRequests !== "") {
    const maxRequests = parseInt(batchMaxRequests, 10);
    if (!isNaN(maxRequests) && maxRequests > 0 && settings.batch.maxRequests !== maxRequests) {
      settings.batch.maxRequests = maxRequests;
      hasChanges = true;
      console.log(`[Config] Batch max requests: ${maxRequests}`);
    }
  }

  if (batchTimeout !== "") {
    const timeout = parseInt(batchTimeout, 10);
    if (!isNaN(timeout) && timeout > 0 && settings.batch.timeout !== timeout) {
      settings.batch.timeout = timeout;
      hasChanges = true;
      console.log(`[Config] Batch timeout: ${timeout}s`);
    }
  }

  if (batchMaxBodySize !== "") {
    const maxBodySize = parseInt(batchMaxBodySize, 10);
    if (!isNaN(maxBodySize) && maxBodySize > 0 && settings.batch.maxBodySize !== maxBodySize) {
      settings.batch.maxBodySize = maxBodySize;
      hasChanges = true;
      console.log(`[Config] Batch max body size: ${maxBodySize} bytes`);
    }
  }

  if (hasChanges) {
    try {
      $app.save(settings);
      console.log("[Config] Batch API settings saved successfully");
    } catch (err) {
      console.error("[Config] Failed to save batch settings:", err);
    }
  }
});

// =============================================================================
// Activity Tracking Hooks
// =============================================================================

// Bump last_activity_at when a field value is created
onRecordAfterCreateSuccess((e) => {
  const auto = require(`${__hooks}/automation.js`);
  const instanceId = e.record.get("instance_id");
  if (instanceId) {
    auto.bumpLastActivity(instanceId);
  }
  e.next();
}, "workflow_instance_field_values");

// Bump last_activity_at when a field value is updated
onRecordAfterUpdateSuccess((e) => {
  const auto = require(`${__hooks}/automation.js`);
  const instanceId = e.record.get("instance_id");
  if (instanceId) {
    auto.bumpLastActivity(instanceId);
  }
  e.next();
}, "workflow_instance_field_values");

// Set last_activity_at when an instance is created
onRecordAfterCreateSuccess((e) => {
  e.record.set("last_activity_at", new Date().toISOString());
  $app.unsafeWithoutHooks().save(e.record);
  e.next();
}, "workflow_instances");

// Bump last_activity_at on real instance changes (stage transition, status change)
onRecordAfterUpdateSuccess((e) => {
  const auto = require(`${__hooks}/automation.js`);
  const original = e.record.original();
  const oldStage = original ? original.get("current_stage_id") : null;
  const newStage = e.record.get("current_stage_id");
  const oldStatus = original ? original.get("status") : null;
  const newStatus = e.record.get("status");

  if (oldStage !== newStage || oldStatus !== newStatus) {
    auto.bumpLastActivity(e.record.id);
  }
  e.next();
}, "workflow_instances");

// =============================================================================
// on_transition trigger
// =============================================================================

onRecordAfterUpdateSuccess((e) => {
  const auto = require(`${__hooks}/automation.js`);
  const original = e.record.original();
  if (!original) { e.next(); return; }

  const oldStageId = original.get("current_stage_id");
  const newStageId = e.record.get("current_stage_id");

  if (oldStageId === newStageId) { e.next(); return; }

  const workflowId = e.record.get("workflow_id");
  const instanceId = e.record.id;

  try {
    const automations = $app.findRecordsByFilter(
      "tools_automation",
      'workflow_id = {:wfId} && trigger_type = "on_transition" && is_enabled = true',
      "",
      20,
      0,
      { wfId: workflowId }
    );

    for (const automation of automations) {
      var config = auto.parseJsonField(automation.get("trigger_config"));
      if (!config) continue;

      const fromMatch = !config.from_stage_id || config.from_stage_id === oldStageId;
      const toMatch = !config.to_stage_id || config.to_stage_id === newStageId;

      if (fromMatch && toMatch) {
        auto.runAutomation(automation, instanceId, newStageId);
      }
    }
  } catch (err) {
    if (("" + err).indexOf("Missing collection") === -1) {
      console.error("[Automation] on_transition error:", err);
    }
  }

  e.next();
}, "workflow_instances");

// =============================================================================
// Global protocol: auto-snapshot on region exit
// =============================================================================
// When an instance leaves a region (set of stages defined by a global protocol tool),
// find when it entered this region (the stage_transition into the region), collect
// all tool_usage from that moment until now, and write a protocol entry.
// Handles cyclic workflows: only captures the most recent visit to the region.

onRecordAfterUpdateSuccess((e) => {
  const auto = require(`${__hooks}/automation.js`);
  const original = e.record.original();
  if (!original) { e.next(); return; }

  const oldStageId = original.get("current_stage_id");
  const newStageId = e.record.get("current_stage_id");
  if (oldStageId === newStageId) { e.next(); return; }

  const workflowId = e.record.get("workflow_id");
  const instanceId = e.record.id;

  try {
    const globalProtocols = $app.findRecordsByFilter(
      "tools_protocol",
      'workflow_id = {:wfId} && is_global = true',
      "",
      50,
      0,
      { wfId: workflowId }
    );

    for (const protocol of globalProtocols) {
      const regionStageIds = protocol.get("stage_id") || [];
      if (!Array.isArray(regionStageIds) || regionStageIds.length === 0) continue;

      var wasInRegion = regionStageIds.indexOf(oldStageId) !== -1;
      var nowOutside = regionStageIds.indexOf(newStageId) === -1;
      if (!wasInRegion || !nowOutside) continue;

      // Find the entry point: most recent stage_transition INTO the region from outside.
      // Walk tool_usage backwards (sorted -executed_at) looking for a stage_transition
      // where metadata.to_stage_id is in the region and metadata.from_stage_id is NOT.
      var allUsage = [];
      try {
        allUsage = $app.findRecordsByFilter(
          "workflow_instance_tool_usage",
          'instance_id = {:instId}',
          "-executed_at",
          1000,
          0,
          { instId: instanceId }
        );
      } catch (err) { console.warn("[Protocol] Failed to load tool usage:", err); }

      var entryTimestamp = null;
      for (var i = 0; i < allUsage.length; i++) {
        var meta = auto.parseJsonField(allUsage[i].get("metadata"));
        if (!meta || meta.action !== "stage_transition") continue;
        var toInRegion = regionStageIds.indexOf(meta.to_stage_id) !== -1;
        var fromOutside = regionStageIds.indexOf(meta.from_stage_id) === -1;
        if (toInRegion && fromOutside) {
          entryTimestamp = allUsage[i].get("executed_at");
          break;
        }
      }

      // If no entry transition found, this might be the start stage -- use instance creation time
      if (!entryTimestamp) {
        try {
          var instance = $app.findRecordById("workflow_instances", instanceId);
          entryTimestamp = instance.get("created");
        } catch (err) {
          continue;
        }
      }

      // Collect all tool_usage from entry timestamp onwards, chronological order
      var spanUsage = [];
      try {
        spanUsage = $app.findRecordsByFilter(
          "workflow_instance_tool_usage",
          'instance_id = {:instId} && executed_at >= {:entryTs}',
          "executed_at",
          1000,
          0,
          { instId: instanceId, entryTs: entryTimestamp }
        );
      } catch (err) { console.warn("[Protocol] Failed to load span usage:", err); }

      // Build lookup maps for human-readable names
      var stageMap = {};
      try {
        var stages = $app.findRecordsByFilter("workflow_stages", "workflow_id = {:wfId}", "", 200, 0, { wfId: workflowId });
        for (var s = 0; s < stages.length; s++) {
          stageMap[stages[s].id] = stages[s].get("stage_name");
        }
      } catch (err) { console.warn("[Protocol] Failed to load stages:", err); }

      var fieldMap = {};
      try {
        var forms = $app.findRecordsByFilter("tools_forms", "workflow_id = {:wfId}", "", 200, 0, { wfId: workflowId });
        for (var fi = 0; fi < forms.length; fi++) {
          try {
            var formFields = $app.findRecordsByFilter("tools_form_fields", "form_id = {:fId}", "", 200, 0, { fId: forms[fi].id });
            for (var ff = 0; ff < formFields.length; ff++) {
              fieldMap[formFields[ff].id] = formFields[ff].get("field_label");
            }
          } catch (err) { /* no fields for this form */ }
        }
      } catch (err) { console.warn("[Protocol] Failed to load form fields:", err); }

      var participantMap = {};
      // Collect unique participant IDs first, then batch-resolve
      var participantIds = {};
      for (var j = 0; j < spanUsage.length; j++) {
        var execBy = spanUsage[j].get("executed_by");
        if (execBy) participantIds[execBy] = true;
      }
      for (var pid in participantIds) {
        try {
          var participant = $app.findRecordById("participants", pid);
          participantMap[pid] = participant.get("name") || participant.get("email") || pid;
        } catch (err) { console.warn("[Protocol] Failed to resolve participant " + pid + ":", err); }
      }

      var auditLog = [];
      for (var j = 0; j < spanUsage.length; j++) {
        var rec = spanUsage[j];
        var stageId = rec.get("stage_id");
        var executedBy = rec.get("executed_by");
        var meta = auto.parseJsonField(rec.get("metadata"));

        // Enrich metadata with human-readable names
        if (meta) {
          if (meta.from_stage_id && stageMap[meta.from_stage_id]) {
            meta.from_stage_name = stageMap[meta.from_stage_id];
          }
          if (meta.to_stage_id && stageMap[meta.to_stage_id]) {
            meta.to_stage_name = stageMap[meta.to_stage_id];
          }
          if (meta.created_fields && Array.isArray(meta.created_fields)) {
            for (var cf = 0; cf < meta.created_fields.length; cf++) {
              if (meta.created_fields[cf].field_key && fieldMap[meta.created_fields[cf].field_key]) {
                meta.created_fields[cf].field_name = fieldMap[meta.created_fields[cf].field_key];
              }
            }
          }
          if (meta.changes && Array.isArray(meta.changes)) {
            for (var ch = 0; ch < meta.changes.length; ch++) {
              if (meta.changes[ch].field_key && fieldMap[meta.changes[ch].field_key]) {
                meta.changes[ch].field_name = fieldMap[meta.changes[ch].field_key];
              }
            }
          }
        }

        auditLog.push({
          id: rec.id,
          stage_id: stageId,
          stage_name: stageMap[stageId] || null,
          executed_by: executedBy,
          executed_by_name: participantMap[executedBy] || null,
          executed_at: rec.get("executed_at"),
          metadata: meta
        });
      }

      var snapshotJson = JSON.stringify(auditLog);

      var hashHex = "";
      try {
        hashHex = $security.sha256(snapshotJson);
      } catch (err) {
        console.error("[Protocol] SHA-256 failed:", err);
      }

      var collection = $app.findCollectionByNameOrId("workflow_protocol_entries");
      var entry = new Record(collection);
      entry.set("instance_id", instanceId);
      entry.set("stage_id", oldStageId);
      entry.set("tool_id", protocol.id);
      entry.set("recorded_at", new Date().toISOString());
      entry.set("snapshot", snapshotJson);
      entry.set("snapshot_hash", hashHex);
      entry.set("field_values", {});
      $app.save(entry);

      console.log("[Protocol] Global '" + protocol.get("name") + "' on instance " + instanceId + " (" + auditLog.length + " audit entries, entered at " + entryTimestamp + ")");
    }
  } catch (err) {
    if (("" + err).indexOf("Missing collection") === -1) {
      console.error("[Protocol] Global protocol error:", err);
    }
  }

  e.next();
}, "workflow_instances");

// =============================================================================
// on_field_change trigger
// =============================================================================

onRecordAfterCreateSuccess((e) => {
  const auto = require(`${__hooks}/automation.js`);
  const instanceId = e.record.get("instance_id");
  const fieldKey = e.record.get("field_key");
  const stageId = e.record.get("stage_id");

  if (!instanceId) { e.next(); return; }

  try {
    const instance = $app.findRecordById("workflow_instances", instanceId);
    const workflowId = instance.get("workflow_id");

    const automations = $app.findRecordsByFilter(
      "tools_automation",
      'workflow_id = {:wfId} && trigger_type = "on_field_change" && is_enabled = true',
      "",
      20,
      0,
      { wfId: workflowId }
    );

    for (const automation of automations) {
      var config = auto.parseJsonField(automation.get("trigger_config"));
      if (!config) continue;

      const stageMatch = !config.stage_id || config.stage_id === stageId;
      const fieldMatch = !config.field_key || config.field_key === fieldKey;

      if (stageMatch && fieldMatch) {
        auto.runAutomation(automation, instanceId, stageId);
      }
    }
  } catch (err) {
    if (("" + err).indexOf("Missing collection") === -1) {
      console.error("[Automation] on_field_change error:", err);
    }
  }

  e.next();
}, "workflow_instance_field_values");

onRecordAfterUpdateSuccess((e) => {
  const auto = require(`${__hooks}/automation.js`);
  const instanceId = e.record.get("instance_id");
  const fieldKey = e.record.get("field_key");
  const stageId = e.record.get("stage_id");

  if (!instanceId) { e.next(); return; }

  try {
    const instance = $app.findRecordById("workflow_instances", instanceId);
    const workflowId = instance.get("workflow_id");

    const automations = $app.findRecordsByFilter(
      "tools_automation",
      'workflow_id = {:wfId} && trigger_type = "on_field_change" && is_enabled = true',
      "",
      20,
      0,
      { wfId: workflowId }
    );

    for (const automation of automations) {
      var config = auto.parseJsonField(automation.get("trigger_config"));
      if (!config) continue;

      const stageMatch = !config.stage_id || config.stage_id === stageId;
      const fieldMatch = !config.field_key || config.field_key === fieldKey;

      if (stageMatch && fieldMatch) {
        auto.runAutomation(automation, instanceId, stageId);
      }
    }
  } catch (err) {
    if (("" + err).indexOf("Missing collection") === -1) {
      console.error("[Automation] on_field_change error:", err);
    }
  }

  e.next();
}, "workflow_instance_field_values");

// =============================================================================
// scheduled trigger (per-automation cron expressions)
// =============================================================================

cronAdd("automation_scheduled_check", "* * * * *", () => {
  var auto = require(`${__hooks}/automation.js`);
  var now = new Date();

  try {
    var automations = $app.findRecordsByFilter(
      "tools_automation",
      'trigger_type = "scheduled" && is_enabled = true',
      "",
      100
    );

    var executed = 0;

    for (var i = 0; i < automations.length; i++) {
      var automation = automations[i];
      var config = auto.parseJsonField(automation.get("trigger_config"));
      if (!config) continue;

      var cronExpr = config.cron;
      if (!cronExpr) continue;

      if (!auto.cronMatchesNow(cronExpr, now)) continue;

      // Double-execution guard: skip if last_run_at is within the last 50 seconds
      var lastRunAt = automation.get("last_run_at");
      if (lastRunAt) {
        var lastRun = new Date(lastRunAt);
        var diffMs = now.getTime() - lastRun.getTime();
        if (diffMs < 50 * 1000) continue;
      }

      var workflowId = automation.get("workflow_id");

      var filter = 'workflow_id = {:wfId} && status = "active"';
      var params = { wfId: workflowId };
      if (config.target_stage_id) {
        filter += ' && current_stage_id = {:targetStage}';
        params.targetStage = config.target_stage_id;
      }
      if (config.inactive_days && config.inactive_days > 0) {
        var cutoffDate = new Date(now.getTime() - config.inactive_days * 86400000).toISOString();
        filter += ' && last_activity_at <= {:cutoff}';
        params.cutoff = cutoffDate;
      }

      try {
        var instances = $app.findRecordsByFilter(
          "workflow_instances",
          filter,
          "",
          500,
          0,
          params
        );

        for (var j = 0; j < instances.length; j++) {
          auto.runAutomation(automation, instances[j].id, instances[j].get("current_stage_id"));
          executed++;
        }
      } catch (err) {
        // No matching instances
      }

      try {
        automation.set("last_run_at", now.toISOString());
        $app.unsafeWithoutHooks().save(automation);
      } catch (err) {
        console.error("[Automation] Failed to update last_run_at:", err);
      }
    }

    if (executed > 0) {
      console.log("[Automation] Scheduled check: executed " + executed + " automation(s).");
    }
  } catch (err) {
    if (("" + err).indexOf("Missing collection") === -1) {
      console.error("[Automation] scheduled cron error:", err);
    }
  }
});

// =============================================================================
// Validation hook for tools_automation
// =============================================================================

onRecordCreateExecute((e) => {
  e.next();
}, "tools_automation");

onRecordUpdateExecute((e) => {
  e.next();
}, "tools_automation");
