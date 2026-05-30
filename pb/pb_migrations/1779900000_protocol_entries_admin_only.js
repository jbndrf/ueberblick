// pb_migrations/1779900000_protocol_entries_admin_only.js
//
// Protocols become admin-only to VIEW. Participants keep CREATING entries
// (recording inspections) but lose read access to historical entries — the
// participant-side "Protocols" tab is removed; admins review entries on the
// per-instance detail page.
//
// Supersedes the workflow_protocol_entries list/view rules set in 1779700000.
// createRule is intentionally left untouched (admin OR participant).

migrate((app) => {
  const protocolEntries = app.findCollectionByNameOrId("workflow_protocol_entries");
  if (protocolEntries) {
    const adminRule = `instance_id.workflow_id.project_id.owner_id = @request.auth.id`;

    // READ is admin-only now — the participant branch is dropped entirely.
    protocolEntries.listRule = adminRule;
    protocolEntries.viewRule = adminRule;

    // CREATE unchanged — participants must still be able to record entries.
    const participantRule = `
      @request.auth.collectionName = "participants"
      && instance_id.workflow_id.project_id = @request.auth.project_id
      && (instance_id.workflow_id.visible_to_roles:length = 0
          || @request.auth.role_id.id ?= instance_id.workflow_id.visible_to_roles.id)
      && (instance_id.workflow_id.private_instances != true
          || instance_id.created_by = @request.auth.id)
      && instance_id.status != "deleted" && instance_id.status != "archived"
    `;
    protocolEntries.createRule = `${adminRule} || (${participantRule})`;

    app.save(protocolEntries);
  }
}, (app) => {
  // DOWN — restore the 1779700000 read rules (admin OR participant).
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
    protocolEntries.createRule = readRule;
    app.save(protocolEntries);
  }
});
