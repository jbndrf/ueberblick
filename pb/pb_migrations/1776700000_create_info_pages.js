migrate((app) => {
  const projectsId = app.findCollectionByNameOrId("projects").id;

  const infoPages = new Collection({
    type: "base",
    name: "info_pages",
    listRule: "@request.auth.id != '' && (@request.auth.collectionName = 'users' || @request.auth.project_id = project_id)",
    viewRule: "@request.auth.id != '' && (@request.auth.collectionName = 'users' || @request.auth.project_id = project_id)",
    createRule: "@request.auth.id != '' && @request.auth.collectionName = 'users'",
    updateRule: "@request.auth.id != '' && @request.auth.collectionName = 'users'",
    deleteRule: "@request.auth.id != '' && @request.auth.collectionName = 'users'",
    fields: [
      { name: "project_id", type: "relation", required: true, collectionId: projectsId, maxSelect: 1 },
      { name: "title", type: "text", required: true, max: 255 },
      { name: "content", type: "editor", required: true },
      { name: "sort_order", type: "number", min: 0 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  app.save(infoPages);
});
