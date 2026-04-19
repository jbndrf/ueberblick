/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
	const mapping = {
		omqyg1zjttd1h73: "privacy",
		yot6r8iun8c3tn7: "imprint",
		zuauhujux8bybjs: "about"
	};

	for (const [infoPageId, pageType] of Object.entries(mapping)) {
		let source;
		try {
			source = app.findRecordById("info_pages", infoPageId);
		} catch (e) {
			continue;
		}

		const target = app.findFirstRecordByFilter(
			"instance_legal_pages",
			"page_type = {:type}",
			{ type: pageType }
		);

		target.set("title", source.getString("title"));
		target.set("content", source.getString("content"));
		app.save(target);

		app.delete(source);
	}
}, (app) => {
	// No-op: original info_pages content cannot be reliably restored.
});
