import { describe, it, expect } from 'vitest';
import {
	buildWorkflowFeatureCollection,
	buildMarkersFeatureCollection
} from './workflow-feature-model';

/** Minimal fake PocketBase client returning canned per-collection data. */
function fakePb(data: Record<string, Array<Record<string, unknown>>>) {
	return {
		collection: (name: string) => ({
			getFullList: async () => structuredClone(data[name] ?? []),
			getList: async () => ({ totalItems: (data[name] ?? []).length, items: [] }),
			getOne: async (id: string) => (data[name] ?? []).find((r) => r.id === id)
		})
	} as unknown as import('pocketbase').default;
}

describe('buildWorkflowFeatureCollection', () => {
	const baseData = {
		workflow_stages: [{ id: 's1', stage_name: 'Stage 1' }],
		workflow_field_defs: [
			{ id: 'f1', label: 'Name', field_type: 'text' },
			{ id: 'f2', label: 'Count', field_type: 'number' }
		],
		roles: [],
		participants: [{ id: 'p1', name: 'Alice' }],
		workflow_field_values: [
			{ id: 'v1', instance_id: 'i1', field_def_id: 'f1', value: 'Hello', recorded_at_stage: 's1' },
			{ id: 'v2', instance_id: 'i1', field_def_id: 'f2', value: '42', recorded_at_stage: 's1' }
		]
	};

	it('emits a FeatureCollection with geometry passthrough and labeled properties', async () => {
		const pb = fakePb({
			...baseData,
			workflow_instances: [
				{
					id: 'i1',
					status: 'active',
					current_stage_id: 's1',
					created_by: 'p1',
					created: '2026-01-01T00:00:00Z',
					updated: '2026-01-02T00:00:00Z',
					last_activity_at: '2026-01-02T00:00:00Z',
					geometry: { type: 'Point', coordinates: [10, 50] },
					centroid: { lon: 10, lat: 50 }
				}
			]
		});

		const fc = await buildWorkflowFeatureCollection(pb, 'proj1', 'wf1');
		expect(fc.type).toBe('FeatureCollection');
		expect(fc.features).toHaveLength(1);

		const f = fc.features[0];
		expect(f.type).toBe('Feature');
		expect(f.id).toBe('i1');
		expect(f.geometry).toEqual({ type: 'Point', coordinates: [10, 50] });
		expect(f.properties.id).toBe('i1');
		expect(f.properties.status).toBe('active');
		expect(f.properties.current_stage).toBe('Stage 1');
		expect(f.properties.created_by).toBe('Alice');
		expect(f.properties.last_activity_at).toBe('2026-01-02T00:00:00Z');
		// Field columns labeled from field defs
		expect(f.properties.Name).toBe('Hello');
		expect(f.properties.Count).toBe('42');
	});

	it('falls back to a Point from centroid when geometry is null', async () => {
		const pb = fakePb({
			...baseData,
			workflow_field_values: [],
			workflow_instances: [
				{
					id: 'i1',
					status: 'active',
					current_stage_id: 's1',
					created_by: 'p1',
					created: '2026-01-01T00:00:00Z',
					updated: '2026-01-01T00:00:00Z',
					geometry: null,
					centroid: { lon: 7.5, lat: 51.5 }
				}
			]
		});

		const fc = await buildWorkflowFeatureCollection(pb, 'proj1', 'wf1');
		expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [7.5, 51.5] });
	});
});

describe('buildMarkersFeatureCollection', () => {
	it('emits Point features from marker location with category labels', async () => {
		const pb = fakePb({
			markers: [
				{
					id: 'm1',
					title: 'Hydrant',
					description: 'red one',
					category_id: 'c1',
					location: { lon: 9, lat: 48 },
					properties: { material: 'steel' },
					created: '2026-01-01T00:00:00Z',
					created_by: 'p1'
				},
				// No location -> skipped
				{ id: 'm2', title: 'no-loc', category_id: 'c1', location: null }
			],
			marker_categories: [{ id: 'c1', name: 'Infrastructure' }]
		});

		const fc = await buildMarkersFeatureCollection(pb, 'proj1');
		expect(fc.features).toHaveLength(1);
		const f = fc.features[0];
		expect(f.geometry).toEqual({ type: 'Point', coordinates: [9, 48] });
		expect(f.properties.title).toBe('Hydrant');
		expect(f.properties.category).toBe('Infrastructure');
		expect(f.properties.material).toBe('steel');
	});
});
