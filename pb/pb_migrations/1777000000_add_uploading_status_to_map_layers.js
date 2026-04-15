/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('map_layers');
		const field = collection.fields.getByName('status');
		collection.fields.removeById(field.id);
		collection.fields.add(
			new Field({
				name: 'status',
				type: 'select',
				required: false,
				maxSelect: 1,
				values: ['uploading', 'pending', 'processing', 'completed', 'failed']
			})
		);
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('map_layers');
		const field = collection.fields.getByName('status');
		collection.fields.removeById(field.id);
		collection.fields.add(
			new Field({
				name: 'status',
				type: 'select',
				required: false,
				maxSelect: 1,
				values: ['pending', 'processing', 'completed', 'failed']
			})
		);
		app.save(collection);
	}
);
