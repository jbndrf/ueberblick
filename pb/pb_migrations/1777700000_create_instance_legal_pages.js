/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
	const usersId = app.findCollectionByNameOrId("users").id;

	const legalPages = new Collection({
		type: "base",
		name: "instance_legal_pages",
		listRule: "",
		viewRule: "",
		createRule: "@request.auth.id != '' && @request.auth.collectionName = 'users'",
		updateRule: "@request.auth.id != '' && @request.auth.collectionName = 'users'",
		deleteRule: "@request.auth.id != '' && @request.auth.collectionName = 'users'",
		fields: [
			{
				name: "page_type",
				type: "select",
				required: true,
				values: ["imprint", "privacy", "cookies", "about"],
				maxSelect: 1
			},
			{ name: "title", type: "text", required: true, max: 255 },
			{ name: "content", type: "editor", required: false },
			{
				name: "updated_by",
				type: "relation",
				required: false,
				collectionId: usersId,
				maxSelect: 1
			},
			{ name: "created", type: "autodate", onCreate: true },
			{ name: "updated", type: "autodate", onCreate: true, onUpdate: true }
		],
		indexes: [
			"CREATE UNIQUE INDEX idx_instance_legal_pages_page_type ON instance_legal_pages (page_type)"
		]
	});

	app.save(legalPages);

	const seeds = [
		{ page_type: "imprint", title: "Impressum" },
		{ page_type: "privacy", title: "Datenschutzhinweise" },
		{ page_type: "cookies", title: "Cookie-Hinweis" },
		{ page_type: "about", title: "Über diese App" }
	];

	for (const seed of seeds) {
		const record = new Record(legalPages);
		record.set("page_type", seed.page_type);
		record.set("title", seed.title);
		record.set("content", "");
		app.save(record);
	}
}, (app) => {
	const collection = app.findCollectionByNameOrId("instance_legal_pages");
	app.delete(collection);
});
