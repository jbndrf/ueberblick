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
// Expression Parser (arithmetic only, no eval)
// =============================================================================

/**
 * Check if a string contains expression syntax (field references like {key}).
 */
function isExpression(value) {
  return typeof value === "string" && value.indexOf("{") !== -1 && value.indexOf("}") !== -1;
}

/**
 * Look up a field value for an instance.
 * @returns {string} The field value or "" if not found.
 */
function lookupFieldValue(instanceId, fieldKey) {
  try {
    const records = $app.findRecordsByFilter(
      "workflow_instance_field_values",
      'instance_id = "' + instanceId + '" && field_key = "' + fieldKey + '"',
      "-updated",
      1
    );
    if (records.length > 0) {
      return records[0].get("value") || "";
    }
  } catch (err) {
    // Field not found
  }
  return "";
}

/**
 * Evaluate an arithmetic expression with field references.
 * Grammar: additive = multiplicative (('+' | '-') multiplicative)*
 *          multiplicative = unary (('*' | '/') unary)*
 *          unary = '-' unary | primary
 *          primary = NUMBER | FIELD_REF | '(' additive ')'
 *
 * Field references: {field_key} resolved via lookupFieldValue()
 * Returns the numeric result as a string.
 * Throws on invalid syntax, non-numeric fields, division by zero.
 */
function evaluateExpression(expr, instanceId) {
  var pos = 0;
  var str = expr.trim();

  function peek() { return pos < str.length ? str[pos] : null; }
  function advance() { return str[pos++]; }
  function skipWhitespace() { while (pos < str.length && (str[pos] === " " || str[pos] === "\t")) pos++; }

  function parseNumber() {
    skipWhitespace();
    var start = pos;
    if (peek() === "-") advance(); // negative sign handled by unary, but allow here too
    while (pos < str.length && ((str[pos] >= "0" && str[pos] <= "9") || str[pos] === ".")) pos++;
    if (pos === start) return null;
    var num = parseFloat(str.substring(start, pos));
    if (isNaN(num)) throw new Error("Invalid number: " + str.substring(start, pos));
    return num;
  }

  function parseFieldRef() {
    skipWhitespace();
    if (peek() !== "{") return null;
    advance(); // skip {
    var start = pos;
    while (pos < str.length && str[pos] !== "}") pos++;
    if (pos >= str.length) throw new Error("Unclosed field reference");
    var fieldKey = str.substring(start, pos);
    advance(); // skip }
    var rawValue = lookupFieldValue(instanceId, fieldKey);
    var num = parseFloat(rawValue);
    if (isNaN(num)) throw new Error("Field '" + fieldKey + "' is not numeric (value: '" + rawValue + "')");
    return num;
  }

  function parsePrimary() {
    skipWhitespace();
    if (peek() === "(") {
      advance(); // skip (
      var val = parseAdditive();
      skipWhitespace();
      if (peek() !== ")") throw new Error("Expected closing parenthesis");
      advance(); // skip )
      return val;
    }
    if (peek() === "{") return parseFieldRef();
    var num = parseNumber();
    if (num !== null) return num;
    throw new Error("Unexpected character: " + (peek() || "end of expression"));
  }

  function parseUnary() {
    skipWhitespace();
    if (peek() === "-") {
      advance();
      return -parseUnary();
    }
    return parsePrimary();
  }

  function parseMultiplicative() {
    var left = parseUnary();
    skipWhitespace();
    while (peek() === "*" || peek() === "/") {
      var op = advance();
      var right = parseUnary();
      if (op === "*") left = left * right;
      else {
        if (right === 0) throw new Error("Division by zero");
        left = left / right;
      }
      skipWhitespace();
    }
    return left;
  }

  function parseAdditive() {
    var left = parseMultiplicative();
    skipWhitespace();
    while (peek() === "+" || peek() === "-") {
      var op = advance();
      var right = parseMultiplicative();
      if (op === "+") left = left + right;
      else left = left - right;
      skipWhitespace();
    }
    return left;
  }

  var result = parseAdditive();
  skipWhitespace();
  if (pos < str.length) throw new Error("Unexpected trailing characters: " + str.substring(pos));

  // Return clean number string (no trailing .0 for integers)
  if (Number.isInteger(result)) return String(result);
  return String(Math.round(result * 1000000) / 1000000); // 6 decimal precision
}

// =============================================================================
// Condition Evaluator
// =============================================================================

/**
 * Evaluate a condition group against an instance.
 * Supports: equals, not_equals, is_empty, is_not_empty, contains,
 *           gt, gte, lt, lte (numeric), and field-to-field comparison.
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

      // Look up the left-hand field value
      const fieldValue = lookupFieldValue(instanceId, fieldKey);

      // Determine comparison value: field-to-field or static
      let compareValue;
      if (condition.params.compare_field_key) {
        compareValue = lookupFieldValue(instanceId, condition.params.compare_field_key);
      } else {
        compareValue = condition.params.value || "";
      }

      switch (operator) {
        case "equals":
          result = fieldValue === compareValue;
          break;
        case "not_equals":
          result = fieldValue !== compareValue;
          break;
        case "is_empty":
          result = fieldValue === "" || fieldValue === null || fieldValue === undefined;
          break;
        case "is_not_empty":
          result = fieldValue !== "" && fieldValue !== null && fieldValue !== undefined;
          break;
        case "contains":
          result = fieldValue.indexOf(compareValue) !== -1;
          break;
        case "gt": {
          const a = parseFloat(fieldValue);
          const b = parseFloat(compareValue);
          result = !isNaN(a) && !isNaN(b) && a > b;
          break;
        }
        case "gte": {
          const a = parseFloat(fieldValue);
          const b = parseFloat(compareValue);
          result = !isNaN(a) && !isNaN(b) && a >= b;
          break;
        }
        case "lt": {
          const a = parseFloat(fieldValue);
          const b = parseFloat(compareValue);
          result = !isNaN(a) && !isNaN(b) && a < b;
          break;
        }
        case "lte": {
          const a = parseFloat(fieldValue);
          const b = parseFloat(compareValue);
          result = !isNaN(a) && !isNaN(b) && a <= b;
          break;
        }
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
 * Supports: set_instance_status, set_field_value (with expressions), set_stage.
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
        // Resolve value: if it's an expression, evaluate it
        let resolvedValue = action.params.value;
        if (isExpression(resolvedValue)) {
          try {
            resolvedValue = evaluateExpression(resolvedValue, instanceId);
          } catch (err) {
            console.error("[Automation] Expression error:", err);
            results.push({ type: action.type, params: action.params, success: false, error: "Expression: " + err });
            continue;
          }
        }

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
          record.set("value", resolvedValue);
          record.set("last_modified_at", new Date().toISOString());
          noHooksApp.save(record);
        } else {
          // Create new
          const collection = $app.findCollectionByNameOrId("workflow_instance_field_values");
          const record = new Record(collection);
          record.set("instance_id", instanceId);
          record.set("field_key", action.params.field_key);
          record.set("value", resolvedValue);
          record.set("stage_id", action.params.stage_id);
          record.set("last_modified_at", new Date().toISOString());
          noHooksApp.save(record);
        }
        var paramsWithResolved = JSON.parse(JSON.stringify(action.params));
        paramsWithResolved.resolved_value = resolvedValue;
        results.push({ type: action.type, params: paramsWithResolved, success: true });

      } else if (action.type === "set_stage") {
        const instance = $app.findRecordById("workflow_instances", instanceId);
        const oldStageId = instance.get("current_stage_id");
        instance.set("current_stage_id", action.params.stage_id);
        instance.set("last_activity_at", new Date().toISOString());
        noHooksApp.save(instance);
        var paramsWithStage = JSON.parse(JSON.stringify(action.params));
        paramsWithStage.from_stage_id = oldStageId;
        results.push({ type: action.type, params: paramsWithStage, success: true });
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
// scheduled trigger (per-automation cron expressions)
// =============================================================================

// Parse a 5-field cron expression and check if it matches the given Date.
// Fields: minute hour dom month dow
// Supports: *, N, N-M, N/step, star/step, comma-separated values
function cronMatchesNow(cronExpr, now) {
  var parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  var minute = now.getMinutes();
  var hour = now.getHours();
  var dom = now.getDate();
  var month = now.getMonth() + 1; // 1-12
  var dow = now.getDay(); // 0=Sun

  function matchField(field, value, min, max) {
    // Handle comma-separated list
    var segments = field.split(",");
    for (var i = 0; i < segments.length; i++) {
      if (matchSegment(segments[i].trim(), value, min, max)) return true;
    }
    return false;
  }

  function matchSegment(seg, value, min, max) {
    // */N -- every N
    if (seg.indexOf("*/") === 0) {
      var step = parseInt(seg.substring(2), 10);
      return !isNaN(step) && step > 0 && value % step === 0;
    }
    // N-M or N-M/step -- range with optional step
    if (seg.indexOf("-") !== -1) {
      var rangeParts = seg.split("/");
      var range = rangeParts[0].split("-");
      var rangeStart = parseInt(range[0], 10);
      var rangeEnd = parseInt(range[1], 10);
      var step = rangeParts.length > 1 ? parseInt(rangeParts[1], 10) : 1;
      if (isNaN(rangeStart) || isNaN(rangeEnd) || isNaN(step)) return false;
      if (value < rangeStart || value > rangeEnd) return false;
      return (value - rangeStart) % step === 0;
    }
    // * -- any
    if (seg === "*") return true;
    // N -- exact
    var exact = parseInt(seg, 10);
    return !isNaN(exact) && exact === value;
  }

  return matchField(parts[0], minute, 0, 59)
    && matchField(parts[1], hour, 0, 23)
    && matchField(parts[2], dom, 1, 31)
    && matchField(parts[3], month, 1, 12)
    && matchField(parts[4], dow, 0, 6);
}

/**
 * Master cron that runs every 15 minutes. Checks all scheduled automations
 * and runs those whose cron expression matches the current time.
 */
cronAdd("automation_scheduled_check", "*/15 * * * *", () => {
  var now = new Date();
  console.log("[Automation] Running scheduled check at " + now.toISOString());

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
      var config = automation.get("trigger_config");
      if (typeof config === "string") {
        try { config = JSON.parse(config); } catch (err) { continue; }
      }

      var cronExpr = config.cron;
      if (!cronExpr) continue;

      // Check if this automation's cron matches now
      if (!cronMatchesNow(cronExpr, now)) continue;

      // Double-execution guard: skip if last_run_at is within the last 14 minutes
      var lastRunAt = automation.get("last_run_at");
      if (lastRunAt) {
        var lastRun = new Date(lastRunAt);
        var diffMs = now.getTime() - lastRun.getTime();
        if (diffMs < 14 * 60 * 1000) continue; // Already ran recently
      }

      var workflowId = automation.get("workflow_id");

      // Build filter for matching instances
      var filter = 'workflow_id = "' + workflowId + '" && status = "active"';
      if (config.target_stage_id) {
        filter += ' && current_stage_id = "' + config.target_stage_id + '"';
      }
      if (config.inactive_days && config.inactive_days > 0) {
        var cutoffDate = new Date(now.getTime() - config.inactive_days * 86400000).toISOString();
        filter += ' && last_activity_at <= "' + cutoffDate + '"';
      }

      try {
        var instances = $app.findRecordsByFilter(
          "workflow_instances",
          filter,
          "",
          500
        );

        for (var j = 0; j < instances.length; j++) {
          runAutomation(automation, instances[j].id, instances[j].get("current_stage_id"));
          executed++;
        }
      } catch (err) {
        // No matching instances
      }

      // Update last_run_at
      try {
        automation.set("last_run_at", now.toISOString());
        $app.unsafeWithoutHooks().save(automation);
      } catch (err) {
        console.error("[Automation] Failed to update last_run_at:", err);
      }
    }

    console.log("[Automation] Scheduled check complete. Executed " + executed + " automation(s).");
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
