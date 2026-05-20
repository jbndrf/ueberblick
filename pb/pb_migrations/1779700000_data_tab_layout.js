// pb_migrations/1779700000_data_tab_layout.js
//
// Per-workflow data-tab presentation refactor.
// See /home/jan/.claude/plans/okay-for-data-presentation-foamy-marble.md
//
// Participant data presentation is no longer derived from workflow stages.
// Each field def carries its own `display_config` JSON (added in 1779000000);
// tabs are emergent. Consequently `workflow_stages.visible_to_roles` is removed
// and every collection rule that gated on stage visibility is re-set without it.
//
// Final rule setters before this migration:
//   - workflow_instances.updateRule        -> 1768800001 (current_stage_id.visible_to_roles)
//   - workflow_instance_tool_usage list/view -> 1776200000 (stage_id.visible_to_roles)
//   - workflow_protocol_entries rules       -> 1776300003 (stage_id.visible_to_roles)
//
// Wipe is acceptable per CLAUDE.md (pre-release; no backwards compat).

migrate((app) => {
  const participantInProject = (projectPath) =>
    `(@request.auth.collectionName = "participants" && ${projectPath} = @request.auth.project_id)`;

  const roleCheck = (rolesField) =>
    `(${rolesField}:length = 0 || @request.auth.role_id.id ?= ${rolesField}.id)`;

  // ============================================================================
  // 1) workflow_instances.updateRule — was gated on current stage visibility.
  //    Instance updates (transitions, data submission) are now gated by who can
  //    act in the workflow at all. Connection.allowed_roles already gates which
  //    transitions a participant can see/trigger.
  // ============================================================================
  let instances = app.findCollectionByNameOrId("workflow_instances");
  if (instances) {
    instances.updateRule = `
      workflow_id.project_id.owner_id = @request.auth.id
      || (${participantInProject("workflow_id.project_id")}
          && ${roleCheck("workflow_id.entry_allowed_roles")})
    `;
    app.save(instances);
  }

  // ============================================================================
  // 2) workflow_instance_tool_usage — drop the stage-visibility term.
  //    Audit trail follows workflow visibility + private-instance ownership.
  // ============================================================================
  const toolUsage = app.findCollectionByNameOrId("workflow_instance_tool_usage");
  if (toolUsage) {
    const toolUsageRule = `
      instance_id.workflow_id.project_id.owner_id = @request.auth.id
      || (@request.auth.collectionName = "participants"
          && instance_id.workflow_id.project_id = @request.auth.project_id
          && (instance_id.workflow_id.visible_to_roles:length = 0 || @request.auth.role_id.id ?= instance_id.workflow_id.visible_to_roles.id)
          && (instance_id.workflow_id.private_instances != true
              || instance_id.created_by = @request.auth.id)
          && instance_id.status != "deleted" && instance_id.status != "archived")
    `;
    toolUsage.listRule = toolUsageRule;
    toolUsage.viewRule = toolUsageRule;
    app.save(toolUsage);
  }

  // ============================================================================
  // 3) workflow_protocol_entries — drop the stage-visibility term.
  // ============================================================================
  const protocolEntries = app.findCollectionByNameOrId("workflow_protocol_entries");
  if (protocolEntries) {
    const adminRule = `instance_id.workflow_id.project_id.owner_id = @request.auth.id`;
    const participantRule = `
      @request.auth.collectionName = "participants"
      && instance_id.workflow_id.project_id = @request.auth.project_id
      && (instance_id.workflow_id.visible_to_roles:length = 0
          || @request.auth.role_id.id ?= instance_id.workflow_id.visible_to_roles.id)
      && (instance_id.workflow_id.private_instances != true
          || instance_id.created_by = @request.auth.id)
      && instance_id.status != "deleted" && instance_id.status != "archived"
    `;
    const readRule = `${adminRule} || (${participantRule})`;
    protocolEntries.listRule = readRule;
    protocolEntries.viewRule = readRule;
    protocolEntries.createRule = `${adminRule} || (${participantRule})`;
    app.save(protocolEntries);
  }

  // ============================================================================
  // 4) Drop workflow_stages.visible_to_roles (no rule references it anymore).
  // ============================================================================
  const stages = app.findCollectionByNameOrId("workflow_stages");
  if (stages) {
    const idx = stages.fields.findIndex((f) => f.name === "visible_to_roles");
    if (idx >= 0) {
      stages.fields.splice(idx, 1);
      app.save(stages);
    }
  }
}, (app) => {
  // DOWN — best-effort. DB-wipe + replay is the recommended rollback.
  const rolesId = app.findCollectionByNameOrId("roles").id;

  const stages = app.findCollectionByNameOrId("workflow_stages");
  if (stages && !stages.fields.find((f) => f.name === "visible_to_roles")) {
    stages.fields.add(new Field({
      name: "visible_to_roles",
      type: "relation",
      collectionId: rolesId,
      maxSelect: 99,
      minSelect: 0,
      required: false,
    }));
    app.save(stages);
  }
  // Rule strings are not restored here — replay from 0 to recover them.
});
