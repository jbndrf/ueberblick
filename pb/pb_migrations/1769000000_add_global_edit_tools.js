// pb_migrations/1769000000_add_global_edit_tools.js
// Add support for global edit tools and edit modes (form_fields vs location)
// Changes:
// 1. Change stage_id from maxSelect:1 to maxSelect:99 (multi-relation for global tools)
// 2. Add edit_mode select field ("form_fields" | "location")
// 3. Add is_global boolean field
// 4. Update API rules to use ?= operator for multi-relation stage_id
migrate((app) => {
  const collection = app.findCollectionByNameOrId("tools_edit")
  const workflowStagesId = app.findCollectionByNameOrId("workflow_stages").id

  // 1. Modify stage_id to support multi-relation (maxSelect: 99)
  const stageIdIndex = collection.fields.findIndex(f => f.name === "stage_id")
  if (stageIdIndex !== -1) {
    collection.fields.splice(stageIdIndex, 1)
  }
  collection.fields.add(new Field({
    name: "stage_id",
    type: "relation",
    collectionId: workflowStagesId,
    maxSelect: 99,  // Changed from 1 to 99 for multi-stage/global tools
    required: false,
  }))

  // 2. Add edit_mode select field
  collection.fields.add(new Field({
    name: "edit_mode",
    type: "select",
    values: ["form_fields", "location"],
    maxSelect: 1,
    required: true,
  }))

  // 3. Add is_global boolean field
  collection.fields.add(new Field({
    name: "is_global",
    type: "bool",
    required: false,
  }))

  // Helper for role-based visibility with "empty = all" logic
  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`

  // 4. Update API rules to use ?= operator for multi-relation stage_id
  // Note: stage_id.workflow_id needs ?= because stage_id is now multi-relation
  // IMPORTANT: Project check must be INSIDE each branch, not at top level
  // (connection-attached tools check via connection_id, stage-attached via stage_id)
  collection.listRule = `
      connection_id.workflow_id.project_id.owner_id = @request.auth.id ||
      stage_id.workflow_id.project_id.owner_id ?= @request.auth.id ||
      (
      @request.auth.collectionName = "participants" &&
      (
        (connection_id != "" && connection_id.workflow_id.project_id = @request.auth.project_id
          && ${roleCheck("connection_id.allowed_roles")}) ||
        (stage_id:length > 0 && stage_id.workflow_id.project_id ?= @request.auth.project_id
          && ${roleCheck("allowed_roles")})
      )
    )
    `

  collection.viewRule = collection.listRule

  collection.createRule = `
    (connection_id.workflow_id.project_id.owner_id = @request.auth.id) ||
    (stage_id.workflow_id.project_id.owner_id ?= @request.auth.id)
  `

  collection.updateRule = collection.createRule
  collection.deleteRule = collection.createRule

  app.save(collection)
}, (app) => {
  // DOWN: Revert changes
  const collection = app.findCollectionByNameOrId("tools_edit")
  const workflowStagesId = app.findCollectionByNameOrId("workflow_stages").id

  // Remove new fields
  const editModeIndex = collection.fields.findIndex(f => f.name === "edit_mode")
  if (editModeIndex !== -1) {
    collection.fields.splice(editModeIndex, 1)
  }

  const isGlobalIndex = collection.fields.findIndex(f => f.name === "is_global")
  if (isGlobalIndex !== -1) {
    collection.fields.splice(isGlobalIndex, 1)
  }

  // Revert stage_id to single relation
  const stageIdIndex = collection.fields.findIndex(f => f.name === "stage_id")
  if (stageIdIndex !== -1) {
    collection.fields.splice(stageIdIndex, 1)
  }
  collection.fields.add(new Field({
    name: "stage_id",
    type: "relation",
    collectionId: workflowStagesId,
    maxSelect: 1,
    required: false,
  }))

  // Revert API rules to original (single-relation syntax)
  collection.listRule = `
      connection_id.workflow_id.project_id.owner_id = @request.auth.id ||
      stage_id.workflow_id.project_id.owner_id = @request.auth.id ||
      (
      @request.auth.collectionName = "participants" &&
      (
        (connection_id != "" && connection_id.workflow_id.project_id = @request.auth.project_id
          && (connection_id.allowed_roles:length = 0 || @request.auth.role_id.id ?= connection_id.allowed_roles.id)) ||
        (stage_id != "" && stage_id.workflow_id.project_id = @request.auth.project_id
          && (allowed_roles:length = 0 || @request.auth.role_id.id ?= allowed_roles.id))
      )
    )
    `
  collection.viewRule = collection.listRule
  collection.createRule = "(connection_id.workflow_id.project_id.owner_id = @request.auth.id) || (stage_id.workflow_id.project_id.owner_id = @request.auth.id)"
  collection.updateRule = collection.createRule
  collection.deleteRule = collection.createRule

  app.save(collection)
})
