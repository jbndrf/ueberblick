migrate((app) => {
  const collection = app.findCollectionByNameOrId("tools_form_fields");

  // Add row_index field (number) - determines which row a field appears in
  collection.fields.add(new Field({
    name: "row_index",
    type: "number",
    min: 0
  }));

  // Add column_position field (select) - determines if field is left, right, or full width
  collection.fields.add(new Field({
    name: "column_position",
    type: "select",
    values: ["left", "right", "full"],
    maxSelect: 1
  }));

  app.save(collection);
}, (app) => {
  // DOWN: Remove the fields
  const collection = app.findCollectionByNameOrId("tools_form_fields");
  collection.fields.removeByName("row_index");
  collection.fields.removeByName("column_position");
  app.save(collection);
});
