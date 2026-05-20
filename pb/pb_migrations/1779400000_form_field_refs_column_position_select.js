/// <reference path="../pb_data/types.d.ts" />

// tools_form_field_refs.column_position was created as a `number` field in
// 1779000000_unified_field_defs.js, but the app uses the string union
// 'left' | 'right' | 'full'. PocketBase coerces those strings to 0 on write,
// which collapses every field to full-width on read. Replace the column with
// a select so the values round-trip correctly.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("tools_form_field_refs");
  collection.fields.removeByName("column_position");
  collection.fields.add(new Field({
    name: "column_position",
    type: "select",
    values: ["left", "right", "full"],
    maxSelect: 1,
  }));
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("tools_form_field_refs");
  collection.fields.removeByName("column_position");
  collection.fields.add(new Field({
    name: "column_position",
    type: "number",
    min: 0,
  }));
  app.save(collection);
});
