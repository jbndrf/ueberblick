/// <reference path="../pb_data/types.d.ts" />

/**
 * Merge map_sources into map_layers.
 *
 * 1. Add source fields to map_layers: source_type, layer_type, url, status, progress, error_message, tile_count
 * 2. Remove source_id relation and is_base_layer bool (replaced by layer_type select)
 * 3. Update access rules (participants read directly, no cross-collection traversal)
 * 4. Drop map_sources collection
 * 5. Add settings JSON field to projects
 */
migrate(
	(app) => {
		// =====================================================================
		// 1. Add source fields to map_layers
		// =====================================================================
		const mapLayers = app.findCollectionByNameOrId('map_layers');

		// source_type (select) -- what kind of source this layer uses
		mapLayers.fields.add(new Field({
			name: 'source_type',
			type: 'select',
			required: true,
			maxSelect: 1,
			values: ['tile', 'wms', 'uploaded', 'preset', 'geojson']
		}));

		// layer_type (select) -- replaces is_base_layer boolean
		mapLayers.fields.add(new Field({
			name: 'layer_type',
			type: 'select',
			required: true,
			maxSelect: 1,
			values: ['base', 'overlay']
		}));

		// url (text) -- tile URL template, WMS endpoint, etc.
		mapLayers.fields.add(new Field({
			name: 'url',
			type: 'text',
			required: false,
			max: 2000
		}));

		// status (select) -- processing status for uploaded layers
		mapLayers.fields.add(new Field({
			name: 'status',
			type: 'select',
			required: false,
			maxSelect: 1,
			values: ['pending', 'processing', 'completed', 'failed']
		}));

		// progress (number) -- upload processing progress 0-100
		mapLayers.fields.add(new Field({
			name: 'progress',
			type: 'number',
			required: false,
			min: 0,
			max: 100
		}));

		// error_message (text) -- processing error details
		mapLayers.fields.add(new Field({
			name: 'error_message',
			type: 'text',
			required: false,
			max: 5000
		}));

		// tile_count (number) -- number of tiles for uploaded sources
		mapLayers.fields.add(new Field({
			name: 'tile_count',
			type: 'number',
			required: false,
			min: 0
		}));

		// =====================================================================
		// 2. Remove source_id relation and is_base_layer bool
		// =====================================================================
		mapLayers.fields.removeByName('source_id');
		mapLayers.fields.removeByName('is_base_layer');

		// =====================================================================
		// 3. Update access rules -- participants read directly, no cross-collection
		// =====================================================================
		const participantReadRule =
			'project_id.owner_id = @request.auth.id || ' +
			'((@request.auth.collectionName = "participants" && project_id = @request.auth.project_id) && ' +
			'(visible_to_roles:length = 0 || @request.auth.role_id.id ?= visible_to_roles.id))';

		mapLayers.listRule = participantReadRule;
		mapLayers.viewRule = participantReadRule;

		app.save(mapLayers);

		// =====================================================================
		// 4. Drop map_sources collection
		// =====================================================================
		const mapSources = app.findCollectionByNameOrId('map_sources');
		app.delete(mapSources);

		// =====================================================================
		// 5. Add settings JSON field to projects
		// =====================================================================
		const projects = app.findCollectionByNameOrId('projects');

		projects.fields.add(new Field({
			name: 'settings',
			type: 'json',
			required: false,
			maxSize: 100000
		}));

		app.save(projects);
	},
	(app) => {
		// =====================================================================
		// Reverse: Recreate map_sources, restore map_layers, remove settings
		// =====================================================================

		// Remove settings from projects
		const projects = app.findCollectionByNameOrId('projects');
		projects.fields.removeByName('settings');
		app.save(projects);

		// Recreate map_sources collection
		const mapSources = new Collection({
			name: 'map_sources',
			type: 'base',
			listRule:
				'owner_id = @request.auth.id || (' +
				'@request.auth.collectionName = "participants" && ' +
				'map_layers_via_source_id.project_id ?= @request.auth.project_id && ' +
				'(map_layers_via_source_id.visible_to_roles:length = 0 || ' +
				'@request.auth.role_id.id ?= map_layers_via_source_id.visible_to_roles.id))',
			viewRule:
				'owner_id = @request.auth.id || (' +
				'@request.auth.collectionName = "participants" && ' +
				'map_layers_via_source_id.project_id ?= @request.auth.project_id && ' +
				'(map_layers_via_source_id.visible_to_roles:length = 0 || ' +
				'@request.auth.role_id.id ?= map_layers_via_source_id.visible_to_roles.id))',
			createRule: '@request.auth.id != ""',
			updateRule: 'owner_id = @request.auth.id',
			deleteRule: 'owner_id = @request.auth.id'
		});

		mapSources.fields.add(new Field({ name: 'owner_id', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1 }));
		mapSources.fields.add(new Field({ name: 'name', type: 'text', required: true, min: 1, max: 255 }));
		mapSources.fields.add(new Field({ name: 'source_type', type: 'select', required: true, maxSelect: 1, values: ['tile', 'wms', 'uploaded', 'preset', 'geojson'] }));
		mapSources.fields.add(new Field({ name: 'url', type: 'text', required: false, max: 2000 }));
		mapSources.fields.add(new Field({ name: 'config', type: 'json', required: false, maxSize: 100000 }));
		mapSources.fields.add(new Field({ name: 'status', type: 'select', required: false, maxSelect: 1, values: ['pending', 'processing', 'completed', 'failed'] }));
		mapSources.fields.add(new Field({ name: 'progress', type: 'number', required: false, min: 0, max: 100 }));
		mapSources.fields.add(new Field({ name: 'error_message', type: 'text', required: false, max: 5000 }));
		mapSources.fields.add(new Field({ name: 'tile_count', type: 'number', required: false, min: 0 }));

		app.save(mapSources);

		// Restore map_layers
		const mapLayers = app.findCollectionByNameOrId('map_layers');

		// Remove new fields
		mapLayers.fields.removeByName('source_type');
		mapLayers.fields.removeByName('layer_type');
		mapLayers.fields.removeByName('url');
		mapLayers.fields.removeByName('status');
		mapLayers.fields.removeByName('progress');
		mapLayers.fields.removeByName('error_message');
		mapLayers.fields.removeByName('tile_count');

		// Re-add source_id relation
		mapLayers.fields.add(new Field({ name: 'source_id', type: 'relation', required: true, collectionId: mapSources.id, maxSelect: 1 }));

		// Re-add is_base_layer bool
		mapLayers.fields.add(new Field({ name: 'is_base_layer', type: 'bool', required: false }));

		app.save(mapLayers);
	}
);
