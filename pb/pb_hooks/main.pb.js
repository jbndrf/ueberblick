// Extending PocketBase with JS - @see https://pocketbase.io/docs/js-overview/

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
// Automation Engine
// =============================================================================

/**
 * Bump last_activity_at on a workflow instance.
 * Uses unsafeWithoutHooks to avoid re-triggering hooks.
 */
function bumpLastActivity(instanceId) {
  try {
    const instance = $app.findRecordById("workflow_instances", instanceId);
    instance.set("last_activity_at", new Date().toISOString());
    $app.unsafeWithoutHooks().save(instance);
  } catch (err) {
    console.error("[Automation] Failed to bump last_activity_at for instance", instanceId, err);
  }
}

// Bump last_activity_at when a field value is created or updated
onRecordAfterCreateSuccess((e) => {
  const instanceId = e.record.get("instance_id");
  if (instanceId) {
    bumpLastActivity(instanceId);
  }
  e.next();
}, "workflow_instance_field_values");

onRecordAfterUpdateSuccess((e) => {
  const instanceId = e.record.get("instance_id");
  if (instanceId) {
    bumpLastActivity(instanceId);
  }
  e.next();
}, "workflow_instance_field_values");

// Bump last_activity_at when an instance itself is created or updated
onRecordAfterCreateSuccess((e) => {
  // Set last_activity_at on creation
  e.record.set("last_activity_at", new Date().toISOString());
  $app.unsafeWithoutHooks().save(e.record);
  e.next();
}, "workflow_instances");

onRecordAfterUpdateSuccess((e) => {
  // Only bump if this is NOT an unsafeWithoutHooks save (check if last_activity_at changed)
  const original = e.record.original();
  const oldStage = original ? original.get("current_stage_id") : null;
  const newStage = e.record.get("current_stage_id");
  const oldStatus = original ? original.get("status") : null;
  const newStatus = e.record.get("status");

  // Only bump for real changes (stage transition, status change)
  if (oldStage !== newStage || oldStatus !== newStatus) {
    bumpLastActivity(e.record.id);
  }
  e.next();
}, "workflow_instances");

// =============================================================================
// Condition Evaluator
// =============================================================================

/**
 * Evaluate a condition group against an instance.
 * @param {object} conditionGroup - { operator: "AND"|"OR", conditions: [...] }
 * @param {string} instanceId
 * @returns {boolean}
 */
function evaluateConditions(conditionGroup, instanceId) {
  if (!conditionGroup || !conditionGroup.conditions || conditionGroup.conditions.length === 0) {
    return true; // No conditions = always match
  }

  const instance = $app.findRecordById("workflow_instances", instanceId);
  const results = [];

  for (const condition of conditionGroup.conditions) {
    let result = false;

    if (condition.type === "instance_status") {
      const currentStatus = instance.get("status");
      result = currentStatus === condition.params.status;
    } else if (condition.type === "field_value") {
      const fieldKey = condition.params.field_key;
      const operator = condition.params.operator;
      const value = condition.params.value || "";

      // Look up the field value
      let fieldValue = "";
      try {
        const fieldRecords = $app.findRecordsByFilter(
          "workflow_instance_field_values",
          'instance_id = "' + instanceId + '" && field_key = "' + fieldKey + '"',
          "-updated",
          1
        );
        if (fieldRecords.length > 0) {
          fieldValue = fieldRecords[0].get("value") || "";
        }
      } catch (err) {
        // Field not found = empty
      }

      switch (operator) {
        case "equals":
          result = fieldValue === value;
          break;
        case "not_equals":
          result = fieldValue !== value;
          break;
        case "is_empty":
          result = fieldValue === "" || fieldValue === null || fieldValue === undefined;
          break;
        case "is_not_empty":
          result = fieldValue !== "" && fieldValue !== null && fieldValue !== undefined;
          break;
        case "contains":
          result = fieldValue.indexOf(value) !== -1;
          break;
        default:
          result = false;
      }
    }

    results.push(result);
  }

  if (conditionGroup.operator === "OR") {
    return results.some(function(r) { return r; });
  }
  // Default: AND
  return results.every(function(r) { return r; });
}

// =============================================================================
// Action Executor
// =============================================================================

/**
 * Execute automation actions on an instance.
 * All writes use unsafeWithoutHooks to prevent loop re-triggering.
 * @param {Array} actions - Array of { type, params }
 * @param {string} instanceId
 * @returns {Array} results - Array of { type, params, success, error? }
 */
function executeActions(actions, instanceId) {
  const results = [];
  const noHooksApp = $app.unsafeWithoutHooks();

  for (const action of actions) {
    try {
      if (action.type === "set_instance_status") {
        const instance = $app.findRecordById("workflow_instances", instanceId);
        instance.set("status", action.params.status);
        noHooksApp.save(instance);
        results.push({ type: action.type, params: action.params, success: true });
      } else if (action.type === "set_field_value") {
        // Find or create the field value record
        let fieldRecords = [];
        try {
          fieldRecords = $app.findRecordsByFilter(
            "workflow_instance_field_values",
            'instance_id = "' + instanceId + '" && field_key = "' + action.params.field_key + '"',
            "",
            1
          );
        } catch (err) {
          // Not found
        }

        if (fieldRecords.length > 0) {
          // Update existing
          const record = fieldRecords[0];
          record.set("value", action.params.value);
          record.set("last_modified_at", new Date().toISOString());
          noHooksApp.save(record);
        } else {
          // Create new
          const collection = $app.findCollectionByNameOrId("workflow_instance_field_values");
          const record = new Record(collection);
          record.set("instance_id", instanceId);
          record.set("field_key", action.params.field_key);
          record.set("value", action.params.value);
          record.set("stage_id", action.params.stage_id);
          record.set("last_modified_at", new Date().toISOString());
          noHooksApp.save(record);
        }
        results.push({ type: action.type, params: action.params, success: true });
      }
    } catch (err) {
      console.error("[Automation] Action failed:", action.type, err);
      results.push({ type: action.type, params: action.params, success: false, error: "" + err });
    }
  }

  return results;
}

/**
 * Log automation execution to workflow_instance_tool_usage.
 */
function logAutomationExecution(instanceId, stageId, automation, actionResults) {
  try {
    const collection = $app.findCollectionByNameOrId("workflow_instance_tool_usage");
    const record = new Record(collection);
    record.set("instance_id", instanceId);
    // executed_by is null for automations
    record.set("executed_at", new Date().toISOString());
    if (stageId) {
      record.set("stage_id", stageId);
    }
    record.set("metadata", JSON.stringify({
      source: "automation",
      automation_id: automation.id,
      automation_name: automation.get("name"),
      trigger_type: automation.get("trigger_type"),
      actions_taken: actionResults
    }));
    $app.unsafeWithoutHooks().save(record);
  } catch (err) {
    console.error("[Automation] Failed to log execution:", err);
  }
}

/**
 * Run a single automation against an instance.
 */
function runAutomation(automation, instanceId, stageId) {
  const conditions = automation.get("conditions");
  let parsedConditions = null;
  if (conditions && conditions !== "null") {
    try {
      parsedConditions = typeof conditions === "string" ? JSON.parse(conditions) : conditions;
    } catch (err) {
      // Invalid conditions JSON
    }
  }

  if (!evaluateConditions(parsedConditions, instanceId)) {
    return; // Conditions not met
  }

  let actions = automation.get("actions");
  if (typeof actions === "string") {
    try { actions = JSON.parse(actions); } catch (err) { return; }
  }
  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return;
  }

  // Cap at 5 actions
  const limitedActions = actions.slice(0, 5);
  const results = executeActions(limitedActions, instanceId);
  logAutomationExecution(instanceId, stageId, automation, results);
  console.log("[Automation] Executed '" + automation.get("name") + "' on instance " + instanceId);
}

// =============================================================================
// on_transition trigger
// =============================================================================

onRecordAfterUpdateSuccess((e) => {
  const original = e.record.original();
  if (!original) { e.next(); return; }

  const oldStageId = original.get("current_stage_id");
  const newStageId = e.record.get("current_stage_id");

  // Only fire if stage actually changed
  if (oldStageId === newStageId) { e.next(); return; }

  const workflowId = e.record.get("workflow_id");
  const instanceId = e.record.id;

  try {
    const automations = $app.findRecordsByFilter(
      "tools_automation",
      'workflow_id = "' + workflowId + '" && trigger_type = "on_transition" && is_enabled = true',
      "",
      20
    );

    for (const automation of automations) {
      let config = automation.get("trigger_config");
      if (typeof config === "string") {
        try { config = JSON.parse(config); } catch (err) { continue; }
      }

      const fromMatch = !config.from_stage_id || config.from_stage_id === oldStageId;
      const toMatch = !config.to_stage_id || config.to_stage_id === newStageId;

      if (fromMatch && toMatch) {
        runAutomation(automation, instanceId, newStageId);
      }
    }
  } catch (err) {
    // No automations found or collection missing
    if (("" + err).indexOf("Missing collection") === -1) {
      console.error("[Automation] on_transition error:", err);
    }
  }

  e.next();
}, "workflow_instances");

// =============================================================================
// on_field_change trigger
// =============================================================================

function handleFieldChange(e) {
  const instanceId = e.record.get("instance_id");
  const fieldKey = e.record.get("field_key");
  const stageId = e.record.get("stage_id");

  if (!instanceId) { e.next(); return; }

  try {
    const instance = $app.findRecordById("workflow_instances", instanceId);
    const workflowId = instance.get("workflow_id");

    const automations = $app.findRecordsByFilter(
      "tools_automation",
      'workflow_id = "' + workflowId + '" && trigger_type = "on_field_change" && is_enabled = true',
      "",
      20
    );

    for (const automation of automations) {
      let config = automation.get("trigger_config");
      if (typeof config === "string") {
        try { config = JSON.parse(config); } catch (err) { continue; }
      }

      const stageMatch = !config.stage_id || config.stage_id === stageId;
      const fieldMatch = !config.field_key || config.field_key === fieldKey;

      if (stageMatch && fieldMatch) {
        runAutomation(automation, instanceId, stageId);
      }
    }
  } catch (err) {
    if (("" + err).indexOf("Missing collection") === -1) {
      console.error("[Automation] on_field_change error:", err);
    }
  }

  e.next();
}

onRecordAfterCreateSuccess(handleFieldChange, "workflow_instance_field_values");
onRecordAfterUpdateSuccess(handleFieldChange, "workflow_instance_field_values");

// =============================================================================
// time_based trigger (daily cron)
// =============================================================================

cronAdd("automation_time_check", "0 2 * * *", () => {
  console.log("[Automation] Running daily time-based check...");

  try {
    const automations = $app.findRecordsByFilter(
      "tools_automation",
      'trigger_type = "time_based" && is_enabled = true',
      "",
      100
    );

    for (const automation of automations) {
      let config = automation.get("trigger_config");
      if (typeof config === "string") {
        try { config = JSON.parse(config); } catch (err) { continue; }
      }

      const days = config.days || 30;
      const cutoffMs = days * 86400000;
      const cutoffDate = new Date(Date.now() - cutoffMs).toISOString();
      const workflowId = automation.get("workflow_id");
      const automationId = automation.id;

      // Build filter for matching instances
      let filter = 'workflow_id = "' + workflowId + '" && status = "active" && last_activity_at <= "' + cutoffDate + '"';
      if (config.stage_id) {
        filter += ' && current_stage_id = "' + config.stage_id + '"';
      }

      try {
        const instances = $app.findRecordsByFilter(
          "workflow_instances",
          filter,
          "",
          100
        );

        for (const instance of instances) {
          // Cooldown: skip if already triggered for this automation+instance in last 24h
          const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
          try {
            const recentLogs = $app.findRecordsByFilter(
              "workflow_instance_tool_usage",
              'instance_id = "' + instance.id + '" && executed_at >= "' + oneDayAgo + '" && metadata ~ "' + automationId + '"',
              "",
              1
            );
            if (recentLogs.length > 0) {
              continue; // Already triggered recently
            }
          } catch (err) {
            // No logs found, proceed
          }

          runAutomation(automation, instance.id, instance.get("current_stage_id"));
        }
      } catch (err) {
        // No matching instances
      }
    }
  } catch (err) {
    if (("" + err).indexOf("Missing collection") === -1) {
      console.error("[Automation] time_based cron error:", err);
    }
  }

  console.log("[Automation] Daily time-based check complete.");
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
