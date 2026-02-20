/// <reference path="../pb_data/types.d.ts" />

/**
 * Add filter_value_icons JSON field to workflows.
 * Stores Record<string, IconConfig> -- keys are field option labels or stage IDs,
 * values are icon config objects.
 */
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('workflows');

		collection.fields.add(
			new Field({
				name: 'filter_value_icons',
				type: 'json',
				system: false,
				required: false,
				options: {
					maxSize: 0
				}
			})
		);

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('workflows');

		collection.fields.removeByName('filter_value_icons');

		app.save(collection);
	}
);
