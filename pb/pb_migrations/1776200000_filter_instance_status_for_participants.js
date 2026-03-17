// pb_migrations/1776200000_filter_instance_status_for_participants.js
// Adds status filtering to participant access rules so deleted/archived instances are hidden.
// Admins continue to see everything.
migrate((app) => {
  const statusFilter = `status != "deleted" && status != "archived"`
  const relStatusFilter = `instance_id.status != "deleted" && instance_id.status != "archived"`

  // 1. workflow_instances - add status filter to participant branch
  const instances = app.findCollectionByNameOrId("workflow_instances")

  const instanceRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && workflow_id.project_id = @request.auth.project_id
          && (workflow_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= workflow_id.visible_to_roles.id)
          && (workflow_id.private_instances != true || created_by = @request.auth.id)
          && ${statusFilter})
    `
  instances.listRule = instanceRule
  instances.viewRule = instanceRule

  app.save(instances)

  // 2. workflow_instance_field_values - add status filter to participant branch
  const fieldValues = app.findCollectionByNameOrId("workflow_instance_field_values")

  const fieldValueRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id
          && (instance_id.workflow_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= instance_id.workflow_id.visible_to_roles.id)
          && (
            (instance_id.workflow_id.private_instances != true && (stage_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= stage_id.visible_to_roles.id))
            || (instance_id.workflow_id.private_instances = true && instance_id.created_by = @request.auth.id)
          )
          && ${relStatusFilter})
    `
  fieldValues.listRule = fieldValueRule
  fieldValues.viewRule = fieldValueRule

  app.save(fieldValues)

  // 3. workflow_instance_tool_usage - add status filter to participant branch
  const toolUsage = app.findCollectionByNameOrId("workflow_instance_tool_usage")

  const toolUsageRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id
          && (instance_id.workflow_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= instance_id.workflow_id.visible_to_roles.id)
          && (
            (instance_id.workflow_id.private_instances != true && (stage_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= stage_id.visible_to_roles.id))
            || (instance_id.workflow_id.private_instances = true && instance_id.created_by = @request.auth.id)
          )
          && ${relStatusFilter})
    `
  toolUsage.listRule = toolUsageRule
  toolUsage.viewRule = toolUsageRule

  app.save(toolUsage)

}, (app) => {
  // DOWN: Restore rules from 1776100000 (without status filtering)

  // 1. workflow_instances
  const instances = app.findCollectionByNameOrId("workflow_instances")
  const instanceRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && workflow_id.project_id = @request.auth.project_id
          && (workflow_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= workflow_id.visible_to_roles.id)
          && (workflow_id.private_instances != true || created_by = @request.auth.id))
    `
  instances.listRule = instanceRule
  instances.viewRule = instanceRule
  app.save(instances)

  // 2. workflow_instance_field_values
  const fieldValues = app.findCollectionByNameOrId("workflow_instance_field_values")
  const fieldValueRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id
          && (instance_id.workflow_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= instance_id.workflow_id.visible_to_roles.id)
          && (
            (instance_id.workflow_id.private_instances != true && (stage_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= stage_id.visible_to_roles.id))
            || (instance_id.workflow_id.private_instances = true && instance_id.created_by = @request.auth.id)
          ))
    `
  fieldValues.listRule = fieldValueRule
  fieldValues.viewRule = fieldValueRule
  app.save(fieldValues)

  // 3. workflow_instance_tool_usage
  const toolUsage = app.findCollectionByNameOrId("workflow_instance_tool_usage")
  const toolUsageRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id
          && (instance_id.workflow_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= instance_id.workflow_id.visible_to_roles.id)
          && (
            (instance_id.workflow_id.private_instances != true && (stage_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= stage_id.visible_to_roles.id))
            || (instance_id.workflow_id.private_instances = true && instance_id.created_by = @request.auth.id)
          ))
    `
  toolUsage.listRule = toolUsageRule
  toolUsage.viewRule = toolUsageRule
  app.save(toolUsage)
})
