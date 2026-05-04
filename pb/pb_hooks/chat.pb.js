/// <reference path="../pb_data/types.d.ts" />

// Project-wide chat hooks:
//   - onRecordCreateExecute(chat_messages): extract @<id> mentions from body
//   - onRecordUpdateExecute(chat_messages): enforce 5-min author edit window
//   - onRecordDeleteExecute(chat_messages): enforce 5-min author delete window
//   - onRecordUpdateExecute(chat_read_state): forbid timestamp regression
//   - GET /api/custom/chat/mentionable-participants: list chat members for picker
//
// IMPORTANT: PocketBase's goja VM isolates each hook callback in its own
// scope. Module-level functions/constants are NOT accessible from inside
// handlers. Every handler below is self-contained.

// --------------------------------------------------------------------------
// chat_messages: extract mentions before persisting
// --------------------------------------------------------------------------
onRecordCreateExecute((e) => {
  var TOKEN = /@([a-z0-9]{15})/g;
  var body = e.record.get("body") || "";
  var projectId = e.record.get("project_id");

  var ids = [];
  var seen = {};
  var match;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(body)) !== null) {
    var id = match[1];
    if (seen[id]) continue;
    seen[id] = true;
    try {
      var p = $app.findRecordById("participants", id);
      if (p.get("project_id") !== projectId) continue;
      ids.push(id);
    } catch (err) { /* unknown id, drop silently */ }
  }

  e.record.set("mentions", ids);
  e.next();
}, "chat_messages");

// 5-minute author edit window for updates.
onRecordUpdateExecute((e) => {
  var EDIT_WINDOW_MS = 5 * 60 * 1000;
  var TOKEN = /@([a-z0-9]{15})/g;

  var original = e.record.original();
  if (original) {
    var createdRaw = original.get("created");
    var createdMs = createdRaw ? new Date(createdRaw).getTime() : 0;
    if (createdMs && Date.now() - createdMs > EDIT_WINDOW_MS) {
      throw new BadRequestError("Edit window has expired");
    }
  }

  // Re-extract mentions if body changed.
  var body = e.record.get("body") || "";
  var projectId = e.record.get("project_id");
  var ids = [];
  var seen = {};
  var match;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(body)) !== null) {
    var id = match[1];
    if (seen[id]) continue;
    seen[id] = true;
    try {
      var p = $app.findRecordById("participants", id);
      if (p.get("project_id") !== projectId) continue;
      ids.push(id);
    } catch (err) { /* drop */ }
  }
  e.record.set("mentions", ids);
  e.next();
}, "chat_messages");

onRecordDeleteExecute((e) => {
  var EDIT_WINDOW_MS = 5 * 60 * 1000;
  var createdRaw = e.record.get("created");
  var createdMs = createdRaw ? new Date(createdRaw).getTime() : 0;
  if (createdMs && Date.now() - createdMs > EDIT_WINDOW_MS) {
    throw new BadRequestError("Delete window has expired");
  }
  e.next();
}, "chat_messages");

// --------------------------------------------------------------------------
// chat_read_state: high-water marks must never regress
// --------------------------------------------------------------------------
onRecordUpdateExecute((e) => {
  var original = e.record.original();
  if (!original) { e.next(); return; }

  function ms(v) { return v ? new Date(v).getTime() : 0; }
  var oldRead = ms(original.get("last_read_at"));
  var newRead = ms(e.record.get("last_read_at"));
  if (newRead < oldRead) {
    e.record.set("last_read_at", original.get("last_read_at"));
  }

  var oldMention = ms(original.get("last_mention_seen_at"));
  var newMention = ms(e.record.get("last_mention_seen_at"));
  if (newMention < oldMention) {
    e.record.set("last_mention_seen_at", original.get("last_mention_seen_at"));
  }

  e.next();
}, "chat_read_state");

// --------------------------------------------------------------------------
// GET /api/custom/chat/mentionable-participants?project_id=<id>
// --------------------------------------------------------------------------
// Mirrors selectable_entities.pb.js. Participants can otherwise only fetch
// their own row (participants.listRule = "@request.auth.id != ''"); this is
// the legitimate path for the mention picker to discover other chat members.
//
// Response: { entities: [{ id, name }, ...] }   (names only, no token, no
//                                                 phone, no metadata)

routerAdd("GET", "/api/custom/chat/mentionable-participants", (e) => {
  function asArray(v) {
    if (Array.isArray(v)) return v;
    if (v === null || v === undefined || v === "") return [];
    return [v];
  }
  function intersects(a, b) {
    for (var i = 0; i < a.length; i++) {
      for (var j = 0; j < b.length; j++) {
        if (a[i] === b[j]) return true;
      }
    }
    return false;
  }

  if (!e.auth || e.auth.collection().name !== "participants") {
    return e.json(403, { error: "participant auth required" });
  }

  var projectId = e.request.url.query().get("project_id");
  if (!projectId) {
    return e.json(400, { error: "project_id query param required" });
  }
  if (projectId !== e.auth.get("project_id")) {
    return e.json(403, { error: "cross-project access denied" });
  }

  var project;
  try {
    project = $app.findRecordById("projects", projectId);
  } catch (err) {
    return e.json(404, { error: "project not found" });
  }

  var chatEnabled = !!project.get("chat_enabled");
  var allowedRoles = asArray(project.get("chat_visible_to_roles"));
  var openToAll = allowedRoles.length === 0;
  var myRoles = asArray(e.auth.get("role_id"));

  var amMember = chatEnabled && (openToAll || intersects(myRoles, allowedRoles));
  if (!amMember) {
    return e.json(403, { error: "not a chat member" });
  }

  var entities = [];
  try {
    var participants = $app.findRecordsByFilter(
      "participants",
      "project_id = {:pid}",
      "name",
      0,
      0,
      { pid: projectId }
    );
    for (var i = 0; i < participants.length; i++) {
      var p = participants[i];
      if (!openToAll) {
        var roles = asArray(p.get("role_id"));
        if (!intersects(roles, allowedRoles)) continue;
      }
      entities.push({
        id: p.get("id"),
        name: p.get("name") || p.get("id"),
      });
    }
  } catch (err) {
    console.error("[chat/mentionable-participants] query failed:", err);
    return e.json(500, { error: "query failed" });
  }

  return e.json(200, { entities: entities });
});
