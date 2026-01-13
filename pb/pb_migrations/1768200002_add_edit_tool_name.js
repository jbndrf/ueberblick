migrate((app) => {
  const collection = app.findCollectionByNameOrId("tools_edit");

  // Add name field to distinguish multiple edit tools
  collection.fields.add(new Field({
    name: "name",
    type: "text",
    required: true,
    max: 255
  }));

  app.save(collection);
}, (app) => {
  // DOWN: Remove the field
  const collection = app.findCollectionByNameOrId("tools_edit");
  collection.fields.removeByName("name");
  app.save(collection);
});
