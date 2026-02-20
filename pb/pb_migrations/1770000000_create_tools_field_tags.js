// pb_migrations/1770000000_create_tools_field_tags.js
// Creates tools_field_tags collection for semantic field tagging (filterable, etc.).
// One record per workflow, tag_mappings is a JSON array of { tagType, fieldId, config }.
migrate((app) => {
  const workflowsId = app.findCollectionByNameOrId("workflows").id

  const toolsFieldTags = new Collection({
    type: "base",
    name: "tools_field_tags",
    // Admin: full access via project ownership
    // Participants: read-only via project membership
    listRule: 'workflow_id.project_id.owner_id = @request.auth.id || (@request.auth.collectionName = "participants" && workflow_id.project_id = @request.auth.project_id)',
    viewRule: 'workflow_id.project_id.owner_id = @request.auth.id || (@request.auth.collectionName = "participants" && workflow_id.project_id = @request.auth.project_id)',
    createRule: "workflow_id.project_id.owner_id = @request.auth.id",
    updateRule: "workflow_id.project_id.owner_id = @request.auth.id",
    deleteRule: "workflow_id.project_id.owner_id = @request.auth.id",
    fields: [
      { name: "workflow_id", type: "relation", required: true, collectionId: workflowsId, maxSelect: 1 },
      { name: "tag_mappings", type: "json" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  })
  app.save(toolsFieldTags)

}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("tools_field_tags")) } catch(e) {}
})
