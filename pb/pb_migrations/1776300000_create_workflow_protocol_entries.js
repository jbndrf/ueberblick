// pb_migrations/1776300000_create_workflow_protocol_entries.js
// Creates the workflow_protocol_entries collection for storing protocol snapshots.
migrate((app) => {
  const instancesId = app.findCollectionByNameOrId("workflow_instances").id;
  const stagesId = app.findCollectionByNameOrId("workflow_stages").id;
  const toolsEditId = app.findCollectionByNameOrId("tools_edit").id;
  const participantsId = app.findCollectionByNameOrId("participants").id;

  const relStatusFilter = `instance_id.status != "deleted" && instance_id.status != "archived"`;

  const adminRule = `instance_id.workflow_id.project_id.owner_id = @request.auth.id`;

  const participantRule = `
    @request.auth.collectionName = "participants"
    && instance_id.workflow_id.project_id = @request.auth.project_id
    && (instance_id.workflow_id.visible_to_roles:length = 0
        || @request.auth.role_id.id ?= instance_id.workflow_id.visible_to_roles.id)
    && (
      (instance_id.workflow_id.private_instances != true
        && (stage_id.visible_to_roles:length = 0
            || @request.auth.role_id.id ?= stage_id.visible_to_roles.id))
      || (instance_id.workflow_id.private_instances = true
        && instance_id.created_by = @request.auth.id)
    )
    && ${relStatusFilter}
  `;

  const readRule = `${adminRule} || (${participantRule})`;

  const collection = new Collection({
    type: "base",
    name: "workflow_protocol_entries",
    listRule: readRule,
    viewRule: readRule,
    createRule: `${adminRule} || (${participantRule})`,
    updateRule: adminRule,
    deleteRule: adminRule,
    fields: [
      {
        name: "instance_id",
        type: "relation",
        required: true,
        collectionId: instancesId,
        maxSelect: 1,
      },
      {
        name: "stage_id",
        type: "relation",
        required: true,
        collectionId: stagesId,
        maxSelect: 1,
      },
      {
        name: "tool_id",
        type: "relation",
        required: true,
        collectionId: toolsEditId,
        maxSelect: 1,
      },
      {
        name: "executed_by",
        type: "relation",
        collectionId: participantsId,
        maxSelect: 1,
      },
      {
        name: "executed_at",
        type: "date",
        required: true,
      },
      {
        name: "values",
        type: "json",
        required: true,
      },
      {
        name: "content_hash",
        type: "text",
      },
      {
        name: "files",
        type: "file",
        maxSelect: 99,
        maxSize: 10485760,
        mimeTypes: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
        ],
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
  });

  app.save(collection);

}, (app) => {
  app.delete(app.findCollectionByNameOrId("workflow_protocol_entries"));
});
