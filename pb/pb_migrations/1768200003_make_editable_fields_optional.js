migrate((app) => {
  const collection = app.findCollectionByNameOrId("tools_edit");

  // Find the editable_fields field and make it optional
  const field = collection.fields.getByName("editable_fields");
  if (field) {
    field.required = false;
  }

  app.save(collection);
}, (app) => {
  // DOWN: Make it required again
  const collection = app.findCollectionByNameOrId("tools_edit");
  const field = collection.fields.getByName("editable_fields");
  if (field) {
    field.required = true;
  }
  app.save(collection);
});
