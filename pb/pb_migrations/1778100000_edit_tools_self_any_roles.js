// pb_migrations/1778100000_edit_tools_self_any_roles.js
//
// Replace tools_edit.allowed_roles with paired role arrays self_edit_roles + any_edit_roles,
// mirroring the custom-table selector pattern (self_select_roles / any_select_roles).
//
// Backfill semantics (preserve current visibility):
//   - allowed_roles non-empty  -> any_edit_roles = allowed_roles
//   - allowed_roles empty (old "everyone" rule) -> any_edit_roles = all role ids in the same project
//   - self_edit_roles stays empty everywhere (no prior equivalent)
//
// After backfill the old "empty = everyone" rule no longer applies; empty arrays mean nobody.
// listRule/viewRule for tools_edit are rewritten against the new fields.

migrate((app) => {
  const collection = app.findCollectionByNameOrId("tools_edit")
  if (!collection) return

  const rolesId = app.findCollectionByNameOrId("roles").id

  // 1. Add the two new fields (idempotent guards in case migration is re-run).
  if (collection.fields.findIndex(f => f.name === "self_edit_roles") === -1) {
    collection.fields.add(new Field({
      name: "self_edit_roles",
      type: "relation",
      collectionId: rolesId,
      maxSelect: 99,
      required: false,
    }))
  }
  if (collection.fields.findIndex(f => f.name === "any_edit_roles") === -1) {
    collection.fields.add(new Field({
      name: "any_edit_roles",
      type: "relation",
      collectionId: rolesId,
      maxSelect: 99,
      required: false,
    }))
  }
  app.save(collection)

  // 2. Backfill from allowed_roles. Resolve each tool's project via either
  //    its connection or its first stage, then either copy the existing roles
  //    or expand to all project roles.
  const allRoles = app.findAllRecords("roles")
  const rolesByProject = new Map()
  for (const r of allRoles) {
    const pid = r.get("project_id")
    if (!pid) continue
    if (!rolesByProject.has(pid)) rolesByProject.set(pid, [])
    rolesByProject.get(pid).push(r.id)
  }

  const projectForTool = (tool) => {
    const connId = tool.get("connection_id")
    if (connId) {
      try {
        const conn = app.findRecordById("workflow_connections", connId)
        const wfId = conn.get("workflow_id")
        if (wfId) {
          const wf = app.findRecordById("workflows", wfId)
          return wf.get("project_id")
        }
      } catch (e) { /* ignore */ }
    }
    const stageIds = tool.get("stage_id")
    if (Array.isArray(stageIds) && stageIds.length > 0) {
      try {
        const stage = app.findRecordById("workflow_stages", stageIds[0])
        const wfId = stage.get("workflow_id")
        if (wfId) {
          const wf = app.findRecordById("workflows", wfId)
          return wf.get("project_id")
        }
      } catch (e) { /* ignore */ }
    }
    return null
  }

  const tools = app.findAllRecords("tools_edit")
  for (const tool of tools) {
    // Skip if already migrated (any_edit_roles already populated).
    const existingAny = tool.get("any_edit_roles")
    if (Array.isArray(existingAny) && existingAny.length > 0) continue

    const allowed = tool.get("allowed_roles")
    let target
    if (Array.isArray(allowed) && allowed.length > 0) {
      target = allowed.slice()
    } else {
      const pid = projectForTool(tool)
      target = pid ? (rolesByProject.get(pid) || []) : []
    }

    tool.set("any_edit_roles", target)
    // self_edit_roles intentionally left empty.
    app.unsafeWithoutHooks().save(tool)
  }

  // 3. Rewrite listRule / viewRule against the new fields.
  //    Old behaviour: connection_id.allowed_roles inherited OR tool's own allowed_roles.
  //    New behaviour: union of (any_edit_roles, self_edit_roles) defines visibility;
  //    row-level "is this my instance?" is enforced client-side at render time.
  const roleInEither = `(@request.auth.role_id.id ?= any_edit_roles.id || @request.auth.role_id.id ?= self_edit_roles.id)`

  const editParticipantRule = `
      @request.auth.collectionName = "participants" &&
      (
        (connection_id != "" && connection_id.workflow_id.project_id = @request.auth.project_id
          && ${roleInEither}) ||
        (stage_id:length > 0 && stage_id.workflow_id.project_id ?= @request.auth.project_id
          && ${roleInEither})
      )
    `

  collection.listRule = `
      connection_id.workflow_id.project_id.owner_id = @request.auth.id ||
      stage_id.workflow_id.project_id.owner_id ?= @request.auth.id ||
      (${editParticipantRule})
    `
  collection.viewRule = collection.listRule
  // create/update/delete remain admin-only (unchanged from 1769000000).
  app.save(collection)

  // 4. Drop allowed_roles after rules no longer reference it.
  const allowedIdx = collection.fields.findIndex(f => f.name === "allowed_roles")
  if (allowedIdx !== -1) {
    collection.fields.splice(allowedIdx, 1)
    app.save(collection)
  }
}, (app) => {
  // DOWN: restore allowed_roles and the previous rule shape. The backfill is
  // not perfectly reversible (we cannot tell which any_edit_roles were
  // originally "empty = everyone" vs explicitly listed); we copy any_edit_roles
  // into allowed_roles as a best effort, dropping self_edit_roles entirely.
  const collection = app.findCollectionByNameOrId("tools_edit")
  if (!collection) return

  const rolesId = app.findCollectionByNameOrId("roles").id

  if (collection.fields.findIndex(f => f.name === "allowed_roles") === -1) {
    collection.fields.add(new Field({
      name: "allowed_roles",
      type: "relation",
      collectionId: rolesId,
      maxSelect: 99,
      required: false,
    }))
    app.save(collection)
  }

  const tools = app.findAllRecords("tools_edit")
  for (const tool of tools) {
    const any = tool.get("any_edit_roles")
    tool.set("allowed_roles", Array.isArray(any) ? any.slice() : [])
    app.unsafeWithoutHooks().save(tool)
  }

  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`

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
  app.save(collection)

  for (const name of ["self_edit_roles", "any_edit_roles"]) {
    const idx = collection.fields.findIndex(f => f.name === name)
    if (idx !== -1) collection.fields.splice(idx, 1)
  }
  app.save(collection)
})
