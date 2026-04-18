// pb_migrations/1777500000_participant_tool_configs.js
// Generic per-participant tool configuration store.
//
// One row = one saved configuration entry for any participant-side tool
// (saved filter view, measure-tool preset, drawing style, ...). The `tool_key`
// discriminates which tool owns the row; each tool defines its own `config`
// JSON shape in TypeScript. This replaces the need for a dedicated collection
// per tool.
//
// Scope: participant_id always set. project_id optional — null means the
// config applies across all projects for that participant.
//
// Access: only the owning participant can read/write their own rows.

migrate((app) => {
  const participantsId = app.findCollectionByNameOrId("participants").id;
  const projectsId = app.findCollectionByNameOrId("projects").id;

  const ownerRule = `@request.auth.collectionName = "participants" && participant_id = @request.auth.id`;

  const collection = new Collection({
    type: "base",
    name: "participant_tool_configs",
    listRule: ownerRule,
    viewRule: ownerRule,
    createRule: ownerRule,
    updateRule: ownerRule,
    deleteRule: ownerRule,
    fields: [
      {
        name: "participant_id",
        type: "relation",
        required: true,
        collectionId: participantsId,
        maxSelect: 1,
        cascadeDelete: true,
      },
      {
        name: "project_id",
        type: "relation",
        required: false,
        collectionId: projectsId,
        maxSelect: 1,
        cascadeDelete: true,
      },
      {
        name: "tool_key",
        type: "text",
        required: true,
        max: 120,
      },
      {
        name: "name",
        type: "text",
        required: true,
        max: 80,
      },
      {
        name: "config",
        type: "json",
        required: true,
        maxSize: 200000,
      },
      {
        name: "sort_order",
        type: "number",
      },
      {
        name: "created",
        type: "autodate",
        onCreate: true,
      },
      {
        name: "updated",
        type: "autodate",
        onCreate: true,
        onUpdate: true,
      },
    ],
    indexes: [
      "CREATE INDEX idx_ptc_participant_tool ON participant_tool_configs (participant_id, tool_key, project_id)",
    ],
  });

  app.save(collection);
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("participant_tool_configs"));
  } catch (e) {}
});
