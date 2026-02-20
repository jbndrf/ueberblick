// pb_migrations/1769900000_create_tools_automation.js
// Creates tools_automation collection for workflow automation rules.
// Also adds last_activity_at to workflow_instances and makes executed_by optional
// on workflow_instance_tool_usage (automations run without a participant).
migrate((app) => {
  const workflowsId = app.findCollectionByNameOrId("workflows").id

  // ============================================
  // 1. Create tools_automation collection
  // ============================================
  const toolsAutomation = new Collection({
    type: "base",
    name: "tools_automation",
    listRule: "workflow_id.project_id.owner_id = @request.auth.id",
    viewRule: "workflow_id.project_id.owner_id = @request.auth.id",
    createRule: "workflow_id.project_id.owner_id = @request.auth.id",
    updateRule: "workflow_id.project_id.owner_id = @request.auth.id",
    deleteRule: "workflow_id.project_id.owner_id = @request.auth.id",
    fields: [
      { name: "workflow_id", type: "relation", required: true, collectionId: workflowsId, maxSelect: 1 },
      { name: "name", type: "text", required: true, max: 200 },
      { name: "trigger_type", type: "select", required: true, values: ["on_transition", "on_field_change", "time_based"], maxSelect: 1 },
      { name: "trigger_config", type: "json", required: true },
      { name: "conditions", type: "json" },
      { name: "actions", type: "json", required: true },
      { name: "is_enabled", type: "bool" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  })
  app.save(toolsAutomation)

  // ============================================
  // 2. Add last_activity_at to workflow_instances
  // ============================================
  const instances = app.findCollectionByNameOrId("workflow_instances")
  instances.fields.add(new Field({
    name: "last_activity_at",
    type: "date",
    required: false,
  }))
  app.save(instances)

  // ============================================
  // 3. Make executed_by optional on tool_usage
  //    (automations log with executed_by = null)
  // ============================================
  const toolUsage = app.findCollectionByNameOrId("workflow_instance_tool_usage")
  const executedByField = toolUsage.fields.getByName("executed_by")
  if (executedByField) {
    // Remove and re-add with required: false
    const participantsId = app.findCollectionByNameOrId("participants").id
    toolUsage.fields.removeById(executedByField.id)
    toolUsage.fields.add(new Field({
      name: "executed_by",
      type: "relation",
      required: false,
      collectionId: participantsId,
      maxSelect: 1,
    }))
    app.save(toolUsage)
  }

}, (app) => {
  // DOWN: Remove tools_automation, last_activity_at, restore executed_by required

  // 1. Delete tools_automation collection
  try { app.delete(app.findCollectionByNameOrId("tools_automation")) } catch(e) {}

  // 2. Remove last_activity_at from workflow_instances
  const instances = app.findCollectionByNameOrId("workflow_instances")
  const lastActivityField = instances.fields.getByName("last_activity_at")
  if (lastActivityField) {
    instances.fields.removeById(lastActivityField.id)
    app.save(instances)
  }

  // 3. Restore executed_by as required on tool_usage
  const toolUsage = app.findCollectionByNameOrId("workflow_instance_tool_usage")
  const executedByField = toolUsage.fields.getByName("executed_by")
  if (executedByField) {
    const participantsId = app.findCollectionByNameOrId("participants").id
    toolUsage.fields.removeById(executedByField.id)
    toolUsage.fields.add(new Field({
      name: "executed_by",
      type: "relation",
      required: true,
      collectionId: participantsId,
      maxSelect: 1,
    }))
    app.save(toolUsage)
  }
})
