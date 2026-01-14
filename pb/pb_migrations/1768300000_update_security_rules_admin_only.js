// pb_migrations/1768300000_update_security_rules_admin_only.js
// Update collection rules to use native PocketBase rules with project ownership checks
// This replaces the custom Go security middleware for admin access
migrate((app) => {
  let collection

  // participants - project owner can manage participants
  collection = app.findCollectionByNameOrId("participants")
  if (collection) {
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    collection.createRule = "project_id.owner_id = @request.auth.id"
    collection.updateRule = "project_id.owner_id = @request.auth.id"
    collection.deleteRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  // roles - project owner can manage roles
  collection = app.findCollectionByNameOrId("roles")
  if (collection) {
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    collection.createRule = "project_id.owner_id = @request.auth.id"
    collection.updateRule = "project_id.owner_id = @request.auth.id"
    collection.deleteRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  // workflows - project owner can manage workflows
  collection = app.findCollectionByNameOrId("workflows")
  if (collection) {
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    collection.createRule = "project_id.owner_id = @request.auth.id"
    collection.updateRule = "project_id.owner_id = @request.auth.id"
    collection.deleteRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  // workflow_stages - via workflow's project
  collection = app.findCollectionByNameOrId("workflow_stages")
  if (collection) {
    collection.listRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.viewRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.createRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.updateRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.deleteRule = "workflow_id.project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  // workflow_connections - via workflow's project
  collection = app.findCollectionByNameOrId("workflow_connections")
  if (collection) {
    collection.listRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.viewRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.createRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.updateRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.deleteRule = "workflow_id.project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  // tools_forms - via workflow's project
  collection = app.findCollectionByNameOrId("tools_forms")
  if (collection) {
    collection.listRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.viewRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.createRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.updateRule = "workflow_id.project_id.owner_id = @request.auth.id"
    collection.deleteRule = "workflow_id.project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  // tools_form_fields - via form's workflow's project
  collection = app.findCollectionByNameOrId("tools_form_fields")
  if (collection) {
    collection.listRule = "form_id.workflow_id.project_id.owner_id = @request.auth.id"
    collection.viewRule = "form_id.workflow_id.project_id.owner_id = @request.auth.id"
    collection.createRule = "form_id.workflow_id.project_id.owner_id = @request.auth.id"
    collection.updateRule = "form_id.workflow_id.project_id.owner_id = @request.auth.id"
    collection.deleteRule = "form_id.workflow_id.project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  // tools_edit - via connection or stage's workflow's project
  collection = app.findCollectionByNameOrId("tools_edit")
  if (collection) {
    collection.listRule = "(connection_id.workflow_id.project_id.owner_id = @request.auth.id) || (stage_id.workflow_id.project_id.owner_id = @request.auth.id)"
    collection.viewRule = "(connection_id.workflow_id.project_id.owner_id = @request.auth.id) || (stage_id.workflow_id.project_id.owner_id = @request.auth.id)"
    collection.createRule = "(connection_id.workflow_id.project_id.owner_id = @request.auth.id) || (stage_id.workflow_id.project_id.owner_id = @request.auth.id)"
    collection.updateRule = "(connection_id.workflow_id.project_id.owner_id = @request.auth.id) || (stage_id.workflow_id.project_id.owner_id = @request.auth.id)"
    collection.deleteRule = "(connection_id.workflow_id.project_id.owner_id = @request.auth.id) || (stage_id.workflow_id.project_id.owner_id = @request.auth.id)"
    app.save(collection)
  }

  // marker_categories - project owner can manage
  collection = app.findCollectionByNameOrId("marker_categories")
  if (collection) {
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    collection.createRule = "project_id.owner_id = @request.auth.id"
    collection.updateRule = "project_id.owner_id = @request.auth.id"
    collection.deleteRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  // markers - project owner can manage
  collection = app.findCollectionByNameOrId("markers")
  if (collection) {
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    collection.createRule = "project_id.owner_id = @request.auth.id"
    collection.updateRule = "project_id.owner_id = @request.auth.id"
    collection.deleteRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  // participant_custom_fields - project owner can manage
  collection = app.findCollectionByNameOrId("participant_custom_fields")
  if (collection) {
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    collection.createRule = "project_id.owner_id = @request.auth.id"
    collection.updateRule = "project_id.owner_id = @request.auth.id"
    collection.deleteRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

  // map_sources - owner can manage, anyone auth can create
  collection = app.findCollectionByNameOrId("map_sources")
  if (collection) {
    collection.listRule = "owner_id = @request.auth.id"
    collection.viewRule = "owner_id = @request.auth.id"
    collection.createRule = "@request.auth.id != ''"
    collection.updateRule = "owner_id = @request.auth.id"
    collection.deleteRule = "owner_id = @request.auth.id"
    app.save(collection)
  }

  // map_layers - project owner can manage
  collection = app.findCollectionByNameOrId("map_layers")
  if (collection) {
    collection.listRule = "project_id.owner_id = @request.auth.id"
    collection.viewRule = "project_id.owner_id = @request.auth.id"
    collection.createRule = "project_id.owner_id = @request.auth.id"
    collection.updateRule = "project_id.owner_id = @request.auth.id"
    collection.deleteRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }

}, (app) => {
  // Revert: restore permissive rules
  let collection

  collection = app.findCollectionByNameOrId("participants")
  if (collection) {
    collection.listRule = "@request.auth.id != ''"
    collection.viewRule = "@request.auth.id != ''"
    collection.createRule = "@request.auth.id != ''"
    collection.updateRule = "@request.auth.id != ''"
    collection.deleteRule = "@request.auth.id != ''"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("roles")
  if (collection) {
    collection.listRule = "@request.auth.id != ''"
    collection.viewRule = "@request.auth.id != ''"
    collection.createRule = "@request.auth.id != ''"
    collection.updateRule = "@request.auth.id != ''"
    collection.deleteRule = "@request.auth.id != ''"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("workflows")
  if (collection) {
    collection.listRule = "@request.auth.id != ''"
    collection.viewRule = "@request.auth.id != ''"
    collection.createRule = "@request.auth.id != ''"
    collection.updateRule = "@request.auth.id != ''"
    collection.deleteRule = "@request.auth.id != ''"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("workflow_stages")
  if (collection) {
    collection.listRule = "@request.auth.id != ''"
    collection.viewRule = "@request.auth.id != ''"
    collection.createRule = "@request.auth.id != ''"
    collection.updateRule = "@request.auth.id != ''"
    collection.deleteRule = "@request.auth.id != ''"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("workflow_connections")
  if (collection) {
    collection.listRule = "@request.auth.id != ''"
    collection.viewRule = "@request.auth.id != ''"
    collection.createRule = "@request.auth.id != ''"
    collection.updateRule = "@request.auth.id != ''"
    collection.deleteRule = "@request.auth.id != ''"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("tools_forms")
  if (collection) {
    collection.listRule = "@request.auth.id != ''"
    collection.viewRule = "@request.auth.id != ''"
    collection.createRule = "@request.auth.id != ''"
    collection.updateRule = "@request.auth.id != ''"
    collection.deleteRule = "@request.auth.id != ''"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("tools_form_fields")
  if (collection) {
    collection.listRule = "@request.auth.id != ''"
    collection.viewRule = "@request.auth.id != ''"
    collection.createRule = "@request.auth.id != ''"
    collection.updateRule = "@request.auth.id != ''"
    collection.deleteRule = "@request.auth.id != ''"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("tools_edit")
  if (collection) {
    collection.listRule = "@request.auth.id != ''"
    collection.viewRule = "@request.auth.id != ''"
    collection.createRule = "@request.auth.id != ''"
    collection.updateRule = "@request.auth.id != ''"
    collection.deleteRule = "@request.auth.id != ''"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("marker_categories")
  if (collection) {
    collection.listRule = "@request.auth.id != ''"
    collection.viewRule = "@request.auth.id != ''"
    collection.createRule = "@request.auth.id != ''"
    collection.updateRule = "@request.auth.id != ''"
    collection.deleteRule = "@request.auth.id != ''"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("markers")
  if (collection) {
    collection.listRule = "@request.auth.id != ''"
    collection.viewRule = "@request.auth.id != ''"
    collection.createRule = "@request.auth.id != ''"
    collection.updateRule = "@request.auth.id != ''"
    collection.deleteRule = "@request.auth.id != ''"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("participant_custom_fields")
  if (collection) {
    collection.listRule = "@request.auth.id != ''"
    collection.viewRule = "@request.auth.id != ''"
    collection.createRule = "@request.auth.id != ''"
    collection.updateRule = "@request.auth.id != ''"
    collection.deleteRule = "@request.auth.id != ''"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("map_sources")
  if (collection) {
    collection.listRule = "@request.auth.id != ''"
    collection.viewRule = "@request.auth.id != ''"
    collection.createRule = "@request.auth.id != ''"
    collection.updateRule = "owner_id = @request.auth.id"
    collection.deleteRule = "owner_id = @request.auth.id"
    app.save(collection)
  }

  collection = app.findCollectionByNameOrId("map_layers")
  if (collection) {
    collection.listRule = "@request.auth.id != ''"
    collection.viewRule = "@request.auth.id != ''"
    collection.createRule = "project_id.owner_id = @request.auth.id"
    collection.updateRule = "project_id.owner_id = @request.auth.id"
    collection.deleteRule = "project_id.owner_id = @request.auth.id"
    app.save(collection)
  }
})
