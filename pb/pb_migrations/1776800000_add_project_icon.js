migrate((app) => {
  const projects = app.findCollectionByNameOrId("projects");

  projects.fields.add(new Field({
    name: "icon",
    type: "file",
    maxSelect: 1,
    maxSize: 2097152,
    mimeTypes: ["image/png", "image/jpeg", "image/svg+xml", "image/webp"]
  }));

  app.save(projects);
}, (app) => {
  const projects = app.findCollectionByNameOrId("projects");
  projects.fields.removeByName("icon");
  app.save(projects);
});
