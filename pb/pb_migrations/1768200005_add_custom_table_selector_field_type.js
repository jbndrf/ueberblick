migrate((app) => {
  const collection = app.findCollectionByNameOrId("tools_form_fields");

  // Find the field_type field and update its allowed values
  const fieldTypeField = collection.fields.find(f => f.name === "field_type");
  if (fieldTypeField) {
    fieldTypeField.values = [
      "short_text",
      "long_text",
      "number",
      "email",
      "date",
      "file",
      "dropdown",
      "multiple_choice",
      "smart_dropdown",
      "custom_table_selector"
    ];
  }

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("tools_form_fields");

  // Revert to original values
  const fieldTypeField = collection.fields.find(f => f.name === "field_type");
  if (fieldTypeField) {
    fieldTypeField.values = [
      "short_text",
      "long_text",
      "number",
      "email",
      "date",
      "file",
      "dropdown",
      "multiple_choice",
      "smart_dropdown"
    ];
  }

  app.save(collection);
});
