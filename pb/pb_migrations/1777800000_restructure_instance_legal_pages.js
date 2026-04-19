/// <reference path="../pb_data/types.d.ts" />

// Replace the fixed-type legal pages (imprint/privacy/cookies/about) with a
// dynamic, admin-editable list modelled after info_pages: slug, title,
// content, sort_order, show_in_consent_footer.

migrate((app) => {
	// Drop the old collection (and all its data). App is under construction;
	// admins will re-enter content on the new /instance admin page.
	try {
		const old = app.findCollectionByNameOrId("instance_legal_pages");
		app.delete(old);
	} catch (e) {
		// Collection may not exist on a fresh install -- fine.
	}

	const usersId = app.findCollectionByNameOrId("users").id;

	const legalPages = new Collection({
		type: "base",
		name: "instance_legal_pages",
		// Public read so the pre-login consent modal and /legal/[slug] can
		// reach content without auth. Writes require an authenticated user.
		listRule: "",
		viewRule: "",
		createRule: "@request.auth.id != '' && @request.auth.collectionName = 'users'",
		updateRule: "@request.auth.id != '' && @request.auth.collectionName = 'users'",
		deleteRule: "@request.auth.id != '' && @request.auth.collectionName = 'users'",
		fields: [
			{ name: "slug", type: "text", required: true, max: 100 },
			{ name: "title", type: "text", required: true, max: 255 },
			{ name: "content", type: "editor", required: false },
			{ name: "sort_order", type: "number", min: 0 },
			{ name: "show_in_consent_footer", type: "bool" },
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
			"CREATE UNIQUE INDEX idx_instance_legal_pages_slug ON instance_legal_pages (slug)"
		]
	});

	app.save(legalPages);
}, (app) => {
	try {
		const collection = app.findCollectionByNameOrId("instance_legal_pages");
		app.delete(collection);
	} catch (e) {}
});
