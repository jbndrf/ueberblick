/// <reference path="../pb_data/types.d.ts" />

// Single-row settings document for instance-wide preferences (consent gate
// toggle + customizable banner text). Seeded with one row; the /instance
// admin UI edits that row in place.

migrate((app) => {
	const usersId = app.findCollectionByNameOrId("users").id;

	const settings = new Collection({
		type: "base",
		name: "instance_settings",
		// Publicly readable so the login page can decide whether to render
		// the consent modal before the visitor has authenticated. Writes
		// require an authenticated user.
		listRule: "",
		viewRule: "",
		createRule: "@request.auth.id != '' && @request.auth.collectionName = 'users'",
		updateRule: "@request.auth.id != '' && @request.auth.collectionName = 'users'",
		deleteRule: "@request.auth.id != '' && @request.auth.collectionName = 'users'",
		fields: [
			{ name: "require_consent_before_login", type: "bool" },
			{ name: "consent_banner_title", type: "text", max: 255 },
			{ name: "consent_banner_body", type: "editor" },
			{ name: "consent_accept_label", type: "text", max: 100 },
			{ name: "consent_reject_label", type: "text", max: 100 },
			{
				name: "updated_by",
				type: "relation",
				required: false,
				collectionId: usersId,
				maxSelect: 1
			},
			{ name: "created", type: "autodate", onCreate: true },
			{ name: "updated", type: "autodate", onCreate: true, onUpdate: true }
		]
	});

	app.save(settings);

	const seed = new Record(settings);
	seed.set("require_consent_before_login", false);
	seed.set("consent_banner_title", "");
	seed.set("consent_banner_body", "");
	seed.set("consent_accept_label", "Accept");
	seed.set("consent_reject_label", "Reject");
	app.save(seed);
}, (app) => {
	try {
		const collection = app.findCollectionByNameOrId("instance_settings");
		app.delete(collection);
	} catch (e) {}
});
