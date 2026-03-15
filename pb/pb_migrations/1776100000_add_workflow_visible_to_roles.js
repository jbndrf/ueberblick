// Add visible_to_roles to workflows and update all instance visibility rules.
migrate((app) => {
  const workflows = app.findCollectionByNameOrId("workflows")
  const rolesCollection = app.findCollectionByNameOrId("roles")

  // Add visible_to_roles field
  workflows.fields.add(new Field({
    name: "visible_to_roles",
    type: "relation",
    collectionId: rolesCollection.id,
    cascadeDelete: false,
    maxSelect: 99,
    minSelect: 0,
    required: false,
  }))

  app.save(workflows)

  // Update workflow_instances list/view rules
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

  // Update workflow_instance_field_values list/view rules
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

  // Update workflow_instance_tool_usage list/view rules
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
}, (app) => {
  // Revert to private_instances-only rules (from previous migration)
  const instances = app.findCollectionByNameOrId("workflow_instances")
  const instanceRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && workflow_id.project_id = @request.auth.project_id
          && (workflow_id.private_instances != true || created_by = @request.auth.id))
    `
  instances.listRule = instanceRule
  instances.viewRule = instanceRule
  app.save(instances)

  const fieldValues = app.findCollectionByNameOrId("workflow_instance_field_values")
  const fieldValueRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id
          && (
            (instance_id.workflow_id.private_instances != true && (stage_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= stage_id.visible_to_roles.id))
            || (instance_id.workflow_id.private_instances = true && instance_id.created_by = @request.auth.id)
          ))
    `
  fieldValues.listRule = fieldValueRule
  fieldValues.viewRule = fieldValueRule
  app.save(fieldValues)

  const toolUsage = app.findCollectionByNameOrId("workflow_instance_tool_usage")
  const toolUsageRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id
          && (
            (instance_id.workflow_id.private_instances != true && (stage_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= stage_id.visible_to_roles.id))
            || (instance_id.workflow_id.private_instances = true && instance_id.created_by = @request.auth.id)
          ))
    `
  toolUsage.listRule = toolUsageRule
  toolUsage.viewRule = toolUsageRule
  app.save(toolUsage)

  // Remove field
  const workflows = app.findCollectionByNameOrId("workflows")
  workflows.fields.removeByName("visible_to_roles")
  app.save(workflows)
})
