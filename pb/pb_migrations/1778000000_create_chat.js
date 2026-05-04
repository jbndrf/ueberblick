/// <reference path="../pb_data/types.d.ts" />

// Project-wide chat MVP.
//
// Two new collections:
//   - chat_messages     : message bodies + denormalised mentions JSON
//   - chat_read_state   : per-participant high-water marks for unread tracking
//
// Two new columns on `projects`:
//   - chat_enabled            : bool kill switch (mirrors workflows.is_active)
//   - chat_visible_to_roles   : roles relation; empty = all project members
//                               (mirrors workflows.visible_to_roles convention)
//
// Membership predicate (used by mention endpoint and chat_messages rules):
//   project.chat_enabled = true
//   AND (project.chat_visible_to_roles:length = 0
//        OR @request.auth.role_id.id ?= project.chat_visible_to_roles.id)

migrate((app) => {
  const projects = app.findCollectionByNameOrId("projects");
  const roles = app.findCollectionByNameOrId("roles");
  const participants = app.findCollectionByNameOrId("participants");

  // 1. Add chat columns to projects.
  projects.fields.add(new Field({
    name: "chat_enabled",
    type: "bool",
    required: false,
  }));
  projects.fields.add(new Field({
    name: "chat_visible_to_roles",
    type: "relation",
    collectionId: roles.id,
    cascadeDelete: false,
    maxSelect: 99,
    minSelect: 0,
    required: false,
  }));
  app.save(projects);

  // Membership predicate as a string fragment, reused below.
  const memberPredicate = `(
    project_id.chat_enabled = true
    && (project_id.chat_visible_to_roles:length = 0
        || @request.auth.role_id.id ?= project_id.chat_visible_to_roles.id)
  )`;

  // 2. chat_messages
  const messagesRule = `
    project_id.owner_id = @request.auth.id
    || (@request.auth.collectionName = "participants"
        && project_id = @request.auth.project_id
        && ${memberPredicate})
  `;
  const authorOnlyRule = `
    project_id.owner_id = @request.auth.id
    || (@request.auth.collectionName = "participants"
        && project_id = @request.auth.project_id
        && ${memberPredicate}
        && author_id = @request.auth.id)
  `;

  const chatMessages = new Collection({
    type: "base",
    name: "chat_messages",
    listRule: messagesRule,
    viewRule: messagesRule,
    createRule: authorOnlyRule,
    updateRule: authorOnlyRule,
    deleteRule: authorOnlyRule,
    fields: [
      { name: "project_id", type: "relation", required: true, collectionId: projects.id, maxSelect: 1, cascadeDelete: true },
      { name: "author_id", type: "relation", required: true, collectionId: participants.id, maxSelect: 1, cascadeDelete: false },
      { name: "body", type: "text", required: true, max: 4000 },
      { name: "mentions", type: "json", required: false, maxSize: 32768 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_chat_messages_project_created ON chat_messages (project_id, created DESC)",
      "CREATE INDEX idx_chat_messages_author ON chat_messages (author_id)",
    ],
  });
  app.save(chatMessages);

  // 3. chat_read_state — own row only.
  const readStateRule = `participant_id = @request.auth.id`;
  const chatReadState = new Collection({
    type: "base",
    name: "chat_read_state",
    listRule: readStateRule,
    viewRule: readStateRule,
    createRule: readStateRule,
    updateRule: readStateRule,
    deleteRule: readStateRule,
    fields: [
      { name: "participant_id", type: "relation", required: true, collectionId: participants.id, maxSelect: 1, cascadeDelete: true },
      { name: "project_id", type: "relation", required: true, collectionId: projects.id, maxSelect: 1, cascadeDelete: true },
      { name: "last_read_at", type: "date", required: true },
      { name: "last_mention_seen_at", type: "date", required: false },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_chat_read_state_participant_project ON chat_read_state (participant_id, project_id)",
    ],
  });
  app.save(chatReadState);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("chat_read_state")); } catch (e) {}
  try { app.delete(app.findCollectionByNameOrId("chat_messages")); } catch (e) {}
  const projects = app.findCollectionByNameOrId("projects");
  projects.fields.removeByName("chat_visible_to_roles");
  projects.fields.removeByName("chat_enabled");
  app.save(projects);
});
