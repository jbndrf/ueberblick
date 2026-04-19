/// <reference path="../pb_data/types.d.ts" />

// Migration: enable cascadeDelete on relations that describe ownership.
// Deleting a workflow removes its stages, connections, forms, form fields,
// edit tools, automations, protocol tools, field tags, and all instance data.
// Deleting a project removes its custom tables, info pages, roles, and participants
// (in addition to the already-cascaded workflows, map layers, offline packages, etc.).

const FLIPS = [
  // workflow -> direct children
  { collection: "workflow_stages",                field: "workflow_id" },
  { collection: "workflow_connections",           field: "workflow_id" },
  { collection: "tools_forms",                    field: "workflow_id" },
  { collection: "tools_automation",               field: "workflow_id" },
  { collection: "tools_protocol",                 field: "workflow_id" },
  { collection: "tools_field_tags",               field: "workflow_id" },
  { collection: "workflow_instances",             field: "workflow_id" },

  // transitive children (form -> fields, connection -> edit tools, instance -> entries)
  { collection: "tools_form_fields",              field: "form_id" },
  { collection: "tools_edit",                     field: "connection_id" },
  { collection: "workflow_instance_tool_usage",   field: "instance_id" },
  { collection: "workflow_instance_field_values", field: "instance_id" },
  { collection: "workflow_protocol_entries",      field: "instance_id" },

  // project -> direct children that were missing cascade
  { collection: "custom_tables",                  field: "project_id" },
  { collection: "info_pages",                     field: "project_id" },
  { collection: "roles",                          field: "project_id" },
  { collection: "participants",                   field: "project_id" },
];

migrate((app) => {
  for (const { collection, field } of FLIPS) {
    const col = app.findCollectionByNameOrId(collection);
    const f = col.fields.getByName(field);
    if (!f) throw new Error(`field ${collection}.${field} not found`);
    f.cascadeDelete = true;
    app.save(col);
  }
}, (app) => {
  for (const { collection, field } of FLIPS) {
    let col;
    try { col = app.findCollectionByNameOrId(collection); } catch (e) { continue; }
    const f = col.fields.getByName(field);
    if (!f) continue;
    f.cascadeDelete = false;
    app.save(col);
  }
});
