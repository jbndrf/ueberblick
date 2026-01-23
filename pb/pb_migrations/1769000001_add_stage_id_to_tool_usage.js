// pb_migrations/1769000001_add_stage_id_to_tool_usage.js
// Add stage_id relation field to workflow_instance_tool_usage for proper role-based filtering
//
// Problem: Current rules use instance_id.current_stage_id.visible_to_roles which checks
// the CURRENT stage, not the stage WHERE THE ACTION HAPPENED. This leaks history data
// when an instance advances to a more permissive stage.
//
// Solution: Add stage_id as a proper relation field and filter by stage_id.visible_to_roles

migrate((app) => {
  const stagesCollection = app.findCollectionByNameOrId("workflow_stages")
  const stagesId = stagesCollection.id

  const collection = app.findCollectionByNameOrId("workflow_instance_tool_usage")
  if (!collection) {
    throw new Error("workflow_instance_tool_usage collection not found")
  }

  // Add stage_id relation field
  collection.fields.add(new Field({
    name: "stage_id",
    type: "relation",
    collectionId: stagesId,
    maxSelect: 1,
    required: false, // Allow null for edge cases
  }))

  // Update rules to use stage_id for visibility instead of instance_id.current_stage_id
  // This ensures history entries are filtered by the stage where the action occurred
  collection.listRule = `
    instance_id.workflow_id.project_id.owner_id = @request.auth.id
    || ((@request.auth.collectionName = "participants" && instance_id.workflow_id.project_id = @request.auth.project_id)
        && (stage_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= stage_id.visible_to_roles.id))
  `
  collection.viewRule = collection.listRule

  app.save(collection)

}, (app) => {
  // DOWN: Remove stage_id field and restore old rules
  const collection = app.findCollectionByNameOrId("workflow_instance_tool_usage")
  if (!collection) return

  // Remove the stage_id field
  const fieldIndex = collection.fields.findIndex(f => f.name === "stage_id")
  if (fieldIndex !== -1) {
    collection.fields.splice(fieldIndex, 1)
  }

  // Restore old rules (using instance_id.current_stage_id)
  collection.listRule = `
    instance_id.workflow_id.project_id.owner_id = @request.auth.id
    || ((@request.auth.collectionName = "participants" && instance_id.workflow_id.project_id = @request.auth.project_id)
        && (instance_id.current_stage_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= instance_id.current_stage_id.visible_to_roles.id))
  `
  collection.viewRule = collection.listRule

  app.save(collection)
})
