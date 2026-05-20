// Automation engine helpers for PocketBase hooks.
// Loaded via require(`${__hooks}/automation.js`) inside each hook handler,
// because PocketBase's goja VM isolates each handler in its own scope.

module.exports = {
  bumpLastActivity,
  parseJsonField,
  lookupFieldValue,
  lookupFieldHistory,
  isExpression,
  evaluateExpression,
  evaluateConditions,
  executeActions,
  logAutomationExecution,
  runAutomation,
  cronMatchesNow,
  FUNCTIONS
};

// =============================================================================
// Autodate Workaround
// =============================================================================

/**
 * Bump the `updated` autodate field via raw SQL.
 * record.set("updated", ...) is silently ignored on autodate fields,
 * so we must use a direct SQL UPDATE after unsafeWithoutHooks().save().
 */
function bumpUpdatedTimestamp(collectionName, recordId) {
  var now = new Date().toISOString();
  $app.db().newQuery(
    'UPDATE "' + collectionName + '" SET updated = {:now} WHERE id = {:id}'
  ).bind({ now: now, id: recordId }).execute();
}

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
 * Targeted SQL UPDATE -- never read the full row and save it back, or a
 * concurrent PATCH on the same row (e.g. a stage transition) can be
 * overwritten by the stale snapshot.
 */
function bumpLastActivity(instanceId) {
  try {
    var now = new Date().toISOString();
    $app.db().newQuery(
      'UPDATE workflow_instances SET last_activity_at = {:now}, updated = {:now} WHERE id = {:id}'
    ).bind({ now: now, id: instanceId }).execute();
  } catch (err) {
    console.error("[Automation] Failed to bump last_activity_at for instance", instanceId, err);
  }
}

// =============================================================================
// Function Registry
// =============================================================================

/**
 * Registry of functions available in expressions.
 * To add a new function, add an entry here. No other code changes needed.
 *
 * Each entry: { minArgs, maxArgs, argTypes: ["raw"|"numeric"...], fn: function(args) }
 * - "numeric" (default): field values are parseFloat'd; sub-expressions evaluate to numbers
 * - "raw": field values are passed as raw strings (for multi-select JSON arrays etc.)
 */
var FUNCTIONS = {
  count: {
    minArgs: 1,
    maxArgs: 1,
    argTypes: ["raw"],
    fn: function(args) {
      var val = args[0];
      if (val === "" || val === null || val === undefined) return 0;
      try {
        var parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed.length;
      } catch (e) { /* not JSON */ }
      if (typeof val === "string" && val.indexOf(",") !== -1) {
        return val.split(",").length;
      }
      return val === "" ? 0 : 1;
    }
  },
  min: {
    minArgs: 2,
    maxArgs: 10,
    argTypes: [],
    fn: function(args) {
      var result = args[0];
      for (var i = 1; i < args.length; i++) {
        if (args[i] < result) result = args[i];
      }
      return result;
    }
  },
  max: {
    minArgs: 2,
    maxArgs: 10,
    argTypes: [],
    fn: function(args) {
      var result = args[0];
      for (var i = 1; i < args.length; i++) {
        if (args[i] > result) result = args[i];
      }
      return result;
    }
  },
  sum: {
    minArgs: 1,
    maxArgs: 10,
    argTypes: [],
    fn: function(args) {
      var total = 0;
      for (var i = 0; i < args.length; i++) total += args[i];
      return total;
    }
  },
  avg: {
    minArgs: 1,
    maxArgs: 10,
    argTypes: [],
    fn: function(args) {
      var total = 0;
      for (var i = 0; i < args.length; i++) total += args[i];
      return total / args.length;
    }
  },
  round: {
    minArgs: 1,
    maxArgs: 2,
    argTypes: [],
    fn: function(args) {
      var value = args[0];
      var decimals = args.length > 1 ? args[1] : 0;
      if (decimals < 0 || decimals > 10) throw new Error("round: decimals must be 0-10");
      var factor = Math.pow(10, decimals);
      return Math.round(value * factor) / factor;
    }
  },
  floor: {
    minArgs: 1,
    maxArgs: 1,
    argTypes: [],
    fn: function(args) { return Math.floor(args[0]); }
  },
  ceil: {
    minArgs: 1,
    maxArgs: 1,
    argTypes: [],
    fn: function(args) { return Math.ceil(args[0]); }
  },
  abs: {
    minArgs: 1,
    maxArgs: 1,
    argTypes: [],
    fn: function(args) { return Math.abs(args[0]); }
  },
  if_empty: {
    minArgs: 2,
    maxArgs: 2,
    argTypes: ["raw", "numeric"],
    fn: function(args) {
      var rawVal = args[0];
      var fallback = args[1];
      if (rawVal === "" || rawVal === null || rawVal === undefined) return fallback;
      var num = parseFloat(rawVal);
      return isNaN(num) ? fallback : num;
    }
  },

  // -------------------------------------------------------------------------
  // Date functions
  // -------------------------------------------------------------------------

  /**
   * today() -- returns today's date as ISO string "YYYY-MM-DD".
   * No arguments. Result is a string (stored as field value via set_field_value).
   */
  today: {
    minArgs: 0,
    maxArgs: 0,
    argTypes: [],
    fn: function() {
      return new Date().toISOString().slice(0, 10);
    }
  },

  /**
   * date_add(date_string, amount, unit)
   * Adds days or months to a date.
   * - unit 0 = days, unit 1 = months
   * - date_string: raw field value in ISO format (YYYY-MM-DD or full ISO)
   * Returns ISO date string "YYYY-MM-DD".
   */
  date_add: {
    minArgs: 3,
    maxArgs: 3,
    argTypes: ["raw", "numeric", "numeric"],
    fn: function(args) {
      var dateStr = args[0];
      var amount = args[1];
      var unit = args[2];
      if (!dateStr || typeof dateStr !== "string") throw new Error("date_add: first argument must be a date string");
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) throw new Error("date_add: invalid date '" + dateStr + "'");
      if (unit === 0) {
        d.setDate(d.getDate() + amount);
      } else if (unit === 1) {
        d.setMonth(d.getMonth() + amount);
      } else {
        throw new Error("date_add: unit must be 0 (days) or 1 (months), got " + unit);
      }
      return d.toISOString().slice(0, 10);
    }
  },

  /**
   * days_between(date1, date2)
   * Returns the number of days between two dates (positive if date2 > date1).
   * Both arguments are raw field values in ISO format.
   */
  days_between: {
    minArgs: 2,
    maxArgs: 2,
    argTypes: ["raw", "raw"],
    fn: function(args) {
      var d1 = new Date(args[0]);
      var d2 = new Date(args[1]);
      if (isNaN(d1.getTime())) throw new Error("days_between: invalid date '" + args[0] + "'");
      if (isNaN(d2.getTime())) throw new Error("days_between: invalid date '" + args[1] + "'");
      var diffMs = d2.getTime() - d1.getTime();
      return Math.round(diffMs / 86400000);
    }
  },

  /**
   * days_until(date_string)
   * Returns days from today until the given date.
   * Positive = future, negative = overdue.
   */
  days_until: {
    minArgs: 1,
    maxArgs: 1,
    argTypes: ["raw"],
    fn: function(args) {
      var target = new Date(args[0]);
      if (isNaN(target.getTime())) throw new Error("days_until: invalid date '" + args[0] + "'");
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      target.setHours(0, 0, 0, 0);
      var diffMs = target.getTime() - today.getTime();
      return Math.round(diffMs / 86400000);
    }
  },

  // -------------------------------------------------------------------------
  // Observation-history functions (Phase 2)
  //
  // All take a {field_def_id} reference and read from workflow_field_values
  // for the current instance. Safe to use against singleton/computed fields
  // too — those just have 1 row of history.
  //
  // The arg type "field_ref" tells the parser to extract the field id without
  // resolving its value, so the function can do its own history query.
  // -------------------------------------------------------------------------

  obs_count: {
    minArgs: 1, maxArgs: 1, argTypes: ["field_ref"],
    fn: function(args, instanceId) {
      return lookupFieldHistory(instanceId, args[0]).length;
    }
  },

  obs_last: {
    minArgs: 1, maxArgs: 1, argTypes: ["field_ref"],
    fn: function(args, instanceId) {
      var h = lookupFieldHistory(instanceId, args[0], 1);
      if (h.length === 0) throw new Error("obs_last: no observations for field " + args[0]);
      var n = parseFloat(h[0].value);
      if (isNaN(n)) throw new Error("obs_last: non-numeric value '" + h[0].value + "'");
      return n;
    }
  },

  obs_first: {
    minArgs: 1, maxArgs: 1, argTypes: ["field_ref"],
    fn: function(args, instanceId) {
      // Newest-first; take the tail.
      var h = lookupFieldHistory(instanceId, args[0]);
      if (h.length === 0) throw new Error("obs_first: no observations for field " + args[0]);
      var v = h[h.length - 1].value;
      var n = parseFloat(v);
      if (isNaN(n)) throw new Error("obs_first: non-numeric value '" + v + "'");
      return n;
    }
  },

  obs_avg: {
    minArgs: 1, maxArgs: 2, argTypes: ["field_ref", "numeric"],
    fn: function(args, instanceId) {
      var limit = args.length > 1 ? Math.floor(args[1]) : 0; // 0 = all
      var h = lookupFieldHistory(instanceId, args[0], limit || 1000);
      if (h.length === 0) throw new Error("obs_avg: no observations for field " + args[0]);
      var total = 0; var count = 0;
      for (var i = 0; i < h.length; i++) {
        var n = parseFloat(h[i].value);
        if (!isNaN(n)) { total += n; count++; }
      }
      if (count === 0) throw new Error("obs_avg: no numeric observations for field " + args[0]);
      return total / count;
    }
  },

  obs_delta: {
    minArgs: 1, maxArgs: 1, argTypes: ["field_ref"],
    fn: function(args, instanceId) {
      var h = lookupFieldHistory(instanceId, args[0], 2);
      if (h.length < 2) throw new Error("obs_delta: need ≥2 observations for field " + args[0]);
      var newest = parseFloat(h[0].value);
      var previous = parseFloat(h[1].value);
      if (isNaN(newest) || isNaN(previous)) throw new Error("obs_delta: non-numeric value");
      return newest - previous;
    }
  },

  obs_since: {
    minArgs: 1, maxArgs: 1, argTypes: ["field_ref"],
    fn: function(args, instanceId) {
      var h = lookupFieldHistory(instanceId, args[0], 1);
      if (h.length === 0) throw new Error("obs_since: no observations for field " + args[0]);
      var t = new Date(h[0].recorded_at);
      if (isNaN(t.getTime())) throw new Error("obs_since: invalid recorded_at");
      var now = new Date();
      return Math.floor((now.getTime() - t.getTime()) / 86400000);
    }
  }
};

// =============================================================================
// Expression Parser (arithmetic + functions, no eval)
// =============================================================================

/**
 * Check if a string contains expression syntax.
 * Matches field references like {key} or function calls like count(...).
 */
function isExpression(value) {
  if (typeof value !== "string") return false;
  if (value.indexOf("{") !== -1 && value.indexOf("}") !== -1) return true;
  if (/[a-z_][a-z0-9_]*\s*\(/.test(value)) return true;
  return false;
}

/**
 * Look up a field value for an instance.
 *
 * Post Phase-1 redesign: the `fieldKey` parameter is a `workflow_field_defs.id`
 * (kept the legacy parameter name for API stability across the codebase). The
 * lookup orders by `recorded_at DESC` so:
 *   - singleton/computed fields naturally return the (only) row,
 *   - observation fields return the latest reading.
 * Use `lookupFieldHistory()` (sibling) for `obs_*` history functions in the
 * expression engine.
 *
 * @returns {string} The field value or "" if not found.
 */
function lookupFieldValue(instanceId, fieldKey) {
  try {
    const records = $app.findRecordsByFilter(
      "workflow_field_values",
      'instance_id = {:instId} && field_def_id = {:fdId}',
      "-recorded_at",
      1,
      0,
      { instId: instanceId, fdId: fieldKey }
    );
    if (records.length > 0) {
      return records[0].get("value") || "";
    }
  } catch (err) {
    // Field def not found, or no value yet — fall through.
  }
  return "";
}

/**
 * Look up the observation history for an instance × field def, newest first.
 * Used by `obs_*` expression functions; safe for singleton/computed fields too
 * (they'll just return a 1-element array).
 *
 * @param {string} instanceId
 * @param {string} fieldDefId
 * @param {number} [limit=1000] max rows
 * @returns {Array<{value: string, recorded_at: string}>}
 */
function lookupFieldHistory(instanceId, fieldDefId, limit) {
  var n = (typeof limit === "number" && limit > 0) ? Math.min(limit, 1000) : 1000;
  try {
    var records = $app.findRecordsByFilter(
      "workflow_field_values",
      'instance_id = {:instId} && field_def_id = {:fdId}',
      "-recorded_at",
      n,
      0,
      { instId: instanceId, fdId: fieldDefId }
    );
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push({
        value: records[i].get("value") || "",
        recorded_at: records[i].get("recorded_at") || records[i].get("created")
      });
    }
    return out;
  } catch (err) {
    return [];
  }
}

/**
 * Evaluate an expression with field references and function calls.
 * Grammar: additive       = multiplicative (('+' | '-') multiplicative)*
 *          multiplicative = unary (('*' | '/') unary)*
 *          unary          = '-' unary | primary
 *          primary        = NUMBER | FUNC_CALL | FIELD_REF | '(' additive ')'
 *          FUNC_CALL      = IDENTIFIER '(' arglist ')'
 *          IDENTIFIER     = [a-z_][a-z0-9_]*
 *
 * Field references: {field_key} resolved via lookupFieldValue()
 * Functions: looked up in FUNCTIONS registry (count, min, max, round, etc.)
 * Returns the numeric result as a string.
 * Throws on invalid syntax, non-numeric fields, division by zero, unknown functions.
 */
function evaluateExpression(expr, instanceId) {
  var pos = 0;
  var str = expr.trim();
  var depth = 0;
  var MAX_DEPTH = 20;

  function peek() { return pos < str.length ? str[pos] : null; }
  function advance() { return str[pos++]; }
  function skipWhitespace() { while (pos < str.length && (str[pos] === " " || str[pos] === "\t")) pos++; }

  function isIdentStart(ch) {
    return ch !== null && ((ch >= "a" && ch <= "z") || ch === "_");
  }

  function isIdentChar(ch) {
    return ch !== null && ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === "_");
  }

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

  function extractFieldKey() {
    if (peek() !== "{") throw new Error("Expected field reference");
    advance();
    var start = pos;
    while (pos < str.length && str[pos] !== "}") pos++;
    if (pos >= str.length) throw new Error("Unclosed field reference");
    var fieldKey = str.substring(start, pos);
    advance();
    return fieldKey;
  }

  function parseFieldRef() {
    skipWhitespace();
    var fieldKey = extractFieldKey();
    var rawValue = lookupFieldValue(instanceId, fieldKey);
    var num = parseFloat(rawValue);
    if (isNaN(num)) throw new Error("Field '" + fieldKey + "' is not numeric (value: '" + rawValue + "')");
    return num;
  }

  function parseRawFieldRef() {
    skipWhitespace();
    var fieldKey = extractFieldKey();
    return lookupFieldValue(instanceId, fieldKey);
  }

  function parseArg(funcName, funcDef, argIndex) {
    var expectedType = (funcDef.argTypes && funcDef.argTypes[argIndex]) || "numeric";
    if (expectedType === "raw") {
      skipWhitespace();
      if (peek() === "{") {
        return parseRawFieldRef();
      }
      var numResult = parseAdditive();
      return String(numResult);
    }
    if (expectedType === "field_ref") {
      // History-aware functions take a literal {field_def_id} reference and
      // do their own lookup against workflow_field_values.
      skipWhitespace();
      if (peek() !== "{") {
        throw new Error(funcName + ": argument " + argIndex + " must be a field reference like {field_key}");
      }
      return extractFieldKey();
    }
    return parseAdditive();
  }

  function parseFunctionCall() {
    var start = pos;
    while (pos < str.length && isIdentChar(str[pos])) pos++;
    var name = str.substring(start, pos);

    if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
      throw new Error("Invalid function name: '" + name + "'");
    }

    if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) {
      throw new Error("Unknown function: '" + name + "'");
    }

    var funcDef = FUNCTIONS[name];

    skipWhitespace();
    if (peek() !== "(") {
      throw new Error("Expected '(' after function name '" + name + "'");
    }
    advance();

    var args = [];
    skipWhitespace();
    if (peek() !== ")") {
      args.push(parseArg(name, funcDef, 0));
      while (true) {
        skipWhitespace();
        if (peek() !== ",") break;
        advance();
        if (args.length >= 10) {
          throw new Error("Too many arguments for function '" + name + "' (max 10)");
        }
        args.push(parseArg(name, funcDef, args.length));
      }
    }

    skipWhitespace();
    if (peek() !== ")") {
      throw new Error("Expected ')' after arguments to '" + name + "'");
    }
    advance();

    if (args.length < funcDef.minArgs) {
      throw new Error("Function '" + name + "' requires at least " + funcDef.minArgs + " argument(s), got " + args.length);
    }
    if (args.length > funcDef.maxArgs) {
      throw new Error("Function '" + name + "' accepts at most " + funcDef.maxArgs + " argument(s), got " + args.length);
    }

    // Pass `instanceId` as a second positional context arg so history
    // functions can read observations. Pre-existing functions ignore it.
    return funcDef.fn(args, instanceId);
  }

  function parsePrimary() {
    skipWhitespace();
    depth++;
    if (depth > MAX_DEPTH) throw new Error("Expression too deeply nested (max " + MAX_DEPTH + ")");

    var result;

    if (peek() === "(") {
      advance();
      result = parseAdditive();
      skipWhitespace();
      if (peek() !== ")") throw new Error("Expected closing parenthesis");
      advance();
    } else if (peek() === "{") {
      result = parseFieldRef();
    } else if (isIdentStart(peek())) {
      result = parseFunctionCall();
    } else {
      var num = parseNumber();
      if (num !== null) {
        result = num;
      } else {
        throw new Error("Unexpected character: " + (peek() || "end of expression"));
      }
    }

    depth--;
    return result;
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

  // Date functions return strings directly (e.g. "2026-09-18")
  if (typeof result === "string") return result;
  if (Number.isInteger(result)) return String(result);
  return String(Math.round(result * 1000000) / 1000000);
}

// =============================================================================
// Condition Evaluator
// =============================================================================

/**
 * Resolve special date placeholders in condition compare values.
 * Supports:
 *   - $today, $today+N, $today-N (day granularity, returns YYYY-MM-DD)
 *   - $now (returns full ISO datetime)
 *   - $now+N{m|h|d}, $now-N{m|h|d} (minute/hour/day offsets, full ISO datetime)
 * Returns the original value unchanged if not a placeholder.
 */
function resolveCompareValue(value) {
  if (typeof value !== "string") return value;
  if (value === "$today") return new Date().toISOString().slice(0, 10);
  var todayMatch = value.match(/^\$today([+-]\d+)$/);
  if (todayMatch) {
    var d = new Date();
    d.setDate(d.getDate() + parseInt(todayMatch[1], 10));
    return d.toISOString().slice(0, 10);
  }
  if (value === "$now") return new Date().toISOString();
  var nowMatch = value.match(/^\$now([+-]\d+)([mhd])$/);
  if (nowMatch) {
    var amount = parseInt(nowMatch[1], 10);
    var unit = nowMatch[2];
    var ms = unit === "m" ? 60000 : unit === "h" ? 3600000 : 86400000;
    return new Date(Date.now() + amount * ms).toISOString();
  }
  return value;
}

/**
 * Check if a string looks like an ISO date (YYYY-MM-DD...).
 */
function isISODate(val) {
  return typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val);
}

/**
 * Evaluate a condition group against an instance.
 * Supports: equals, not_equals, is_empty, is_not_empty, contains,
 *           gt, gte, lt, lte (numeric or date), and field-to-field comparison.
 * Compare values support $today, $today+N, $today-N placeholders.
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
    } else if (condition.type === "current_stage") {
      const currentStageId = instance.get("current_stage_id");
      if (condition.params.operator === "not_equals") {
        result = currentStageId !== condition.params.stage_id;
      } else {
        result = currentStageId === condition.params.stage_id;
      }
    } else if (condition.type === "field_value") {
      const fieldKey = condition.params.field_key;
      const operator = condition.params.operator;

      const fieldValue = lookupFieldValue(instanceId, fieldKey);

      let compareValue;
      if (condition.params.compare_field_key) {
        compareValue = lookupFieldValue(instanceId, condition.params.compare_field_key);
      } else {
        compareValue = resolveCompareValue(condition.params.value || "");
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
          if (isISODate(fieldValue) && isISODate(compareValue)) {
            result = fieldValue > compareValue;
          } else {
            const a = parseFloat(fieldValue);
            const b = parseFloat(compareValue);
            result = !isNaN(a) && !isNaN(b) && a > b;
          }
          break;
        }
        case "gte": {
          if (isISODate(fieldValue) && isISODate(compareValue)) {
            result = fieldValue >= compareValue;
          } else {
            const a = parseFloat(fieldValue);
            const b = parseFloat(compareValue);
            result = !isNaN(a) && !isNaN(b) && a >= b;
          }
          break;
        }
        case "lt": {
          if (isISODate(fieldValue) && isISODate(compareValue)) {
            result = fieldValue < compareValue;
          } else {
            const a = parseFloat(fieldValue);
            const b = parseFloat(compareValue);
            result = !isNaN(a) && !isNaN(b) && a < b;
          }
          break;
        }
        case "lte": {
          if (isISODate(fieldValue) && isISODate(compareValue)) {
            result = fieldValue <= compareValue;
          } else {
            const a = parseFloat(fieldValue);
            const b = parseFloat(compareValue);
            result = !isNaN(a) && !isNaN(b) && a <= b;
          }
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
        // Targeted UPDATE so we can't clobber a concurrent PATCH to
        // current_stage_id or any other field on the instance.
        var nowStatusTs = new Date().toISOString();
        $app.db().newQuery(
          'UPDATE workflow_instances SET status = {:status}, updated = {:now} WHERE id = {:id}'
        ).bind({ status: action.params.status, now: nowStatusTs, id: instanceId }).execute();
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

        // Post Phase-1 redesign: params.field_key now carries a
        // workflow_field_defs.id. Look up the def to learn write_mode — it's
        // recorded on the value row as a render hint (storage is append-only).
        const fieldDefId = action.params.field_key;
        var fieldDef = null;
        try {
          fieldDef = $app.findRecordById("workflow_field_defs", fieldDefId);
        } catch (err) {
          // No matching def — likely stale automation referring to deleted field.
        }
        if (!fieldDef) {
          results.push({ type: action.type, params: action.params, success: false, error: "Unknown field_def_id: " + fieldDefId });
          continue;
        }
        const writeMode = fieldDef.get("write_mode") || "singleton";

        // Stage attribution for the append-only value row's recorded_at_stage:
        // automations don't run "on a connection", so use the instance's
        // current stage. (Data presentation is driven by display tabs, not
        // stages — recorded_at_stage is kept only for audit/protocol snapshots.)
        var inst = $app.findRecordById("workflow_instances", instanceId);
        var stageId = inst.get("current_stage_id");
        var nowIso = new Date().toISOString();

        // workflow_field_values is append-only — every write_mode just inserts
        // a new row. "Current value" is the latest by recorded_at; write_mode
        // is stored only so the read layer knows how to render it.
        const collection = $app.findCollectionByNameOrId("workflow_field_values");
        const record = new Record(collection);
        record.set("instance_id", instanceId);
        record.set("field_def_id", fieldDefId);
        record.set("write_mode", writeMode);
        record.set("value", resolvedValue);
        record.set("recorded_at", nowIso);
        record.set("recorded_at_stage", stageId);
        $app.save(record);

        // Drop resolved_value from the action log — it would leak into
        // tool_usage.metadata where field-level view_roles don't apply.
        results.push({ type: action.type, params: action.params, success: true });

      } else if (action.type === "set_stage") {
        // Read-only lookup for the audit trail, then apply the transition
        // via a targeted UPDATE. A read-full/save-full would race with any
        // concurrent PATCH on the same instance and clobber fields the
        // caller never intended to touch.
        const instance = $app.findRecordById("workflow_instances", instanceId);
        const oldStageId = instance.get("current_stage_id");
        var nowTs = new Date().toISOString();
        $app.db().newQuery(
          'UPDATE workflow_instances SET current_stage_id = {:stage}, last_activity_at = {:now}, updated = {:now} WHERE id = {:id}'
        ).bind({ stage: action.params.stage_id, now: nowTs, id: instanceId }).execute();
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

    var metadata = {
      source: "automation",
      automation_id: automation.id,
      automation_name: automation.get("name"),
      trigger_type: automation.get("trigger_type"),
      actions_taken: actionResults
    };

    // Surface the last successful set_stage as a top-level stage_transition so
    // the activity-feed renderer (toolUsageLabel) shows "→ <stage name>" instead
    // of a generic "Action" label.
    var lastStageChange = null;
    for (var i = actionResults.length - 1; i >= 0; i--) {
      if (actionResults[i].type === "set_stage" && actionResults[i].success) {
        lastStageChange = actionResults[i];
        break;
      }
    }
    if (lastStageChange) {
      metadata.action = "stage_transition";
      var toStageId = lastStageChange.params && lastStageChange.params.stage_id;
      var fromStageId = lastStageChange.params && lastStageChange.params.from_stage_id;
      if (toStageId) {
        metadata.to_stage_id = toStageId;
        try {
          var toRec = $app.findRecordById("workflow_stages", toStageId);
          metadata.to_stage_name = toRec.get("stage_name");
        } catch (err) { /* stage missing */ }
      }
      if (fromStageId) {
        metadata.from_stage_id = fromStageId;
        try {
          var fromRec = $app.findRecordById("workflow_stages", fromStageId);
          metadata.from_stage_name = fromRec.get("stage_name");
        } catch (err) { /* stage missing */ }
      }
    }

    record.set("metadata", JSON.stringify(metadata));
    $app.save(record);
  } catch (err) {
    console.error("[Automation] Failed to log execution:", err);
  }
}

/**
 * Run a single automation against an instance.
 * Executes steps sequentially -- each step has its own conditions (guard) and actions.
 * Step 2 can read DB writes from step 1 because lookupFieldValue() queries live.
 */
function runAutomation(automation, instanceId, stageId) {
  var steps = parseJsonField(automation.get("steps"));
  if (!steps || !Array.isArray(steps) || steps.length === 0) return;

  var executionMode = automation.get("execution_mode") || "run_all";

  var allResults = [];
  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    var conditionsMatch = !step.conditions || evaluateConditions(step.conditions, instanceId);
    if (!conditionsMatch) {
      continue; // skip step, not entire automation
    }
    var actions = step.actions;
    if (!actions || !Array.isArray(actions) || actions.length === 0) continue;
    var results = executeActions(actions.slice(0, 5), instanceId);
    for (var j = 0; j < results.length; j++) {
      results[j].step_name = step.name || "Step " + (i + 1);
    }
    allResults = allResults.concat(results);
    if (executionMode === "first_match") break; // stop after first matching step
  }
  if (allResults.length > 0) {
    logAutomationExecution(instanceId, stageId, automation, allResults);
    console.log("[Automation] Executed '" + automation.get("name") + "' on instance " + instanceId);
  }
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
