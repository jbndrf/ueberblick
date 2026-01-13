migrate((app) => {
  // Add visual_config to tools_forms for stage-attached forms
  const toolsForms = app.findCollectionByNameOrId("tools_forms");
  toolsForms.fields.add(new Field({
    name: "visual_config",
    type: "json"
  }));
  app.save(toolsForms);

  // Add visual_config to tools_edit for stage-attached edit tools
  const toolsEdit = app.findCollectionByNameOrId("tools_edit");
  toolsEdit.fields.add(new Field({
    name: "visual_config",
    type: "json"
  }));
  app.save(toolsEdit);

}, (app) => {
  // DOWN: Remove the fields
  const toolsForms = app.findCollectionByNameOrId("tools_forms");
  toolsForms.fields.removeByName("visual_config");
  app.save(toolsForms);

  const toolsEdit = app.findCollectionByNameOrId("tools_edit");
  toolsEdit.fields.removeByName("visual_config");
  app.save(toolsEdit);
});
