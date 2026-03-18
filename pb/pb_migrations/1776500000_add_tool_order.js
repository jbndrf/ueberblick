migrate((app) => {
  // Add tool_order to tools_forms
  const formsCollection = app.findCollectionByNameOrId("tools_forms");
  formsCollection.fields.add(new Field({
    name: "tool_order",
    type: "number",
    min: 0
  }));
  app.save(formsCollection);

  // Add tool_order to tools_edit
  const editCollection = app.findCollectionByNameOrId("tools_edit");
  editCollection.fields.add(new Field({
    name: "tool_order",
    type: "number",
    min: 0
  }));
  app.save(editCollection);

  // Add tool_order to tools_protocol
  const protocolCollection = app.findCollectionByNameOrId("tools_protocol");
  protocolCollection.fields.add(new Field({
    name: "tool_order",
    type: "number",
    min: 0
  }));
  app.save(protocolCollection);
}, (app) => {
  const formsCollection = app.findCollectionByNameOrId("tools_forms");
  formsCollection.fields.removeByName("tool_order");
  app.save(formsCollection);

  const editCollection = app.findCollectionByNameOrId("tools_edit");
  editCollection.fields.removeByName("tool_order");
  app.save(editCollection);

  const protocolCollection = app.findCollectionByNameOrId("tools_protocol");
  protocolCollection.fields.removeByName("tool_order");
  app.save(protocolCollection);
});
