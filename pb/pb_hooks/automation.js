// Automation engine helpers for PocketBase hooks.
// Loaded via require(`${__hooks}/automation.js`) inside each hook handler,
// because PocketBase's goja VM isolates each handler in its own scope.

module.exports = {
  bumpLastActivity,
  parseJsonField,
  lookupFieldValue,
  isExpression,
  evaluateExpression,
  evaluateConditions,
  executeActions,
  logAutomationExecution,
  runAutomation,
  cronMatchesNow
};

// =============================================================================
// JSON Field Helper
// =============================================================================

/**
 * Parse a PocketBase JSON field value.
 * In PocketBase v0.35+, record.get() on JSON fields returns a byte array
 * (array of numbers) instead of a parsed object or string.
 * This helper handles all cases: byte array, string, or already-parsed object.
 */
function parseJsonField(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch (err) { return null; }
  }
  // Byte array (array of numbers) -- convert to string then parse
  if (Array.isArray(value)) {
    try {
      var str = "";
      for (var i = 0; i < value.length; i++) {
        str += String.fromCharCode(value[i]);
      }
      return JSON.parse(str);
    } catch (err) { return null; }
  }
  return null;
}

// =============================================================================
// Activity Tracking
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
    if (peek() === "-") advance();
    while (pos < str.length && ((str[pos] >= "0" && str[pos] <= "9") || str[pos] === ".")) pos++;
    if (pos === start) return null;
    var num = parseFloat(str.substring(start, pos));
    if (isNaN(num)) throw new Error("Invalid number: " + str.substring(start, pos));
    return num;
  }

  function parseFieldRef() {
    skipWhitespace();
    if (peek() !== "{") return null;
    advance();
    var start = pos;
    while (pos < str.length && str[pos] !== "}") pos++;
    if (pos >= str.length) throw new Error("Unclosed field reference");
    var fieldKey = str.substring(start, pos);
    advance();
    var rawValue = lookupFieldValue(instanceId, fieldKey);
    var num = parseFloat(rawValue);
    if (isNaN(num)) throw new Error("Field '" + fieldKey + "' is not numeric (value: '" + rawValue + "')");
    return num;
  }

  function parsePrimary() {
    skipWhitespace();
    if (peek() === "(") {
      advance();
      var val = parseAdditive();
      skipWhitespace();
      if (peek() !== ")") throw new Error("Expected closing parenthesis");
      advance();
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

  if (Number.isInteger(result)) return String(result);
  return String(Math.round(result * 1000000) / 1000000);
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
    return true;
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

      const fieldValue = lookupFieldValue(instanceId, fieldKey);

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
          const record = fieldRecords[0];
          record.set("value", resolvedValue);
          record.set("last_modified_at", new Date().toISOString());
          noHooksApp.save(record);
        } else {
          const collection = $app.findCollectionByNameOrId("workflow_instance_field_values");
          const record = new Record(collection);
          record.set("instance_id", instanceId);
          record.set("field_key", action.params.field_key);
          record.set("value", resolvedValue);
          record.set("stage_id", action.params.stage_id);
          record.set("last_modified_at", new Date().toISOString());
          $app.save(record);
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
    record.set("id", $security.randomStringWithAlphabet(15, "abcdefghijklmnopqrstuvwxyz0123456789"));
    record.set("instance_id", instanceId);
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
    $app.save(record);
  } catch (err) {
    console.error("[Automation] Failed to log execution:", err);
  }
}

/**
 * Run a single automation against an instance.
 */
function runAutomation(automation, instanceId, stageId) {
  var parsedConditions = parseJsonField(automation.get("conditions"));

  if (!evaluateConditions(parsedConditions, instanceId)) {
    return;
  }

  var actions = parseJsonField(automation.get("actions"));
  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return;
  }

  var limitedActions = actions.slice(0, 5);
  var results = executeActions(limitedActions, instanceId);
  logAutomationExecution(instanceId, stageId, automation, results);
  console.log("[Automation] Executed '" + automation.get("name") + "' on instance " + instanceId);
}

// =============================================================================
// Cron Expression Parser
// =============================================================================

/**
 * Parse a 5-field cron expression and check if it matches the given Date.
 * Fields: minute hour dom month dow
 * Supports: *, N, N-M, N/step, star/step, comma-separated values
 */
function cronMatchesNow(cronExpr, now) {
  var parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  var minute = now.getMinutes();
  var hour = now.getHours();
  var dom = now.getDate();
  var month = now.getMonth() + 1;
  var dow = now.getDay();

  function matchField(field, value, min, max) {
    var segments = field.split(",");
    for (var i = 0; i < segments.length; i++) {
      if (matchSegment(segments[i].trim(), value, min, max)) return true;
    }
    return false;
  }

  function matchSegment(seg, value, min, max) {
    if (seg.indexOf("*/") === 0) {
      var step = parseInt(seg.substring(2), 10);
      return !isNaN(step) && step > 0 && value % step === 0;
    }
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
    if (seg === "*") return true;
    var exact = parseInt(seg, 10);
    return !isNaN(exact) && exact === value;
  }

  return matchField(parts[0], minute, 0, 59)
    && matchField(parts[1], hour, 0, 23)
    && matchField(parts[2], dom, 1, 31)
    && matchField(parts[3], month, 1, 12)
    && matchField(parts[4], dow, 0, 6);
}
