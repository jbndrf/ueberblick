// pb_migrations/1776300001_add_protocol_fields_to_tools_edit.js
// Extends tools_edit with protocol support:
// - edit_mode: add 'protocol' value
// - protocol_form_id: relation to tools_forms
// - prefill_config: JSON for pre-fill toggle per field
migrate((app) => {
  const collection = app.findCollectionByNameOrId("tools_edit");
  const toolsFormsId = app.findCollectionByNameOrId("tools_forms").id;

  // Replace edit_mode field to add 'protocol' as a valid value
  const editModeIndex = collection.fields.findIndex(f => f.name === "edit_mode");
  if (editModeIndex !== -1) {
    collection.fields.splice(editModeIndex, 1);
  }

  collection.fields.add(new Field({
    name: "edit_mode",
    type: "select",
    values: ["form_fields", "location", "protocol"],
    maxSelect: 1,
  }));

  // Add protocol_form_id relation
  collection.fields.add(new Field({
    name: "protocol_form_id",
    type: "relation",
    collectionId: toolsFormsId,
    maxSelect: 1,
  }));

  // Add prefill_config JSON
  collection.fields.add(new Field({
    name: "prefill_config",
    type: "json",
  }));

  app.save(collection);

}, (app) => {
  const collection = app.findCollectionByNameOrId("tools_edit");

  collection.fields.removeByName("prefill_config");
  collection.fields.removeByName("protocol_form_id");

  // Restore edit_mode without 'protocol'
  const editModeIndex = collection.fields.findIndex(f => f.name === "edit_mode");
  if (editModeIndex !== -1) {
    collection.fields.splice(editModeIndex, 1);
  }

  collection.fields.add(new Field({
    name: "edit_mode",
    type: "select",
    values: ["form_fields", "location"],
    maxSelect: 1,
  }));

  app.save(collection);
});
