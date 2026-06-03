/**
 * Resolve `custom_table_selector` field values to human-readable labels.
 *
 * A `custom_table_selector` field stores raw record IDs as its value. This helper
 * loads the referenced source (custom table rows / participants / roles / marker
 * category markers) and builds, per field, an `{ id, label }` lookup so callers can
 * render the stored IDs as readable text.
 *
 * Fetches are deduped per source, so multiple fields pointing at the same source
 * share a single underlying request.
 */
import type PocketBase from 'pocketbase';

export interface FieldEntityDef {
	id: string;
	type: string;
	fieldOptions: any;
}

export interface ResolvedEntity {
	id: string;
	label: string;
}

export async function resolveFieldEntities(
	pb: PocketBase,
	projectId: string,
	fields: FieldEntityDef[]
): Promise<Map<string, ResolvedEntity[]>> {
	const rawFetchCache = new Map<string, Promise<any[]>>();
	const cachedFetch = (key: string, fetcher: () => Promise<any[]>): Promise<any[]> => {
		let p = rawFetchCache.get(key);
		if (!p) {
			p = fetcher();
			rawFetchCache.set(key, p);
		}
		return p;
	};

	const result = new Map<string, ResolvedEntity[]>();

	await Promise.all(
		fields
			.filter((fd) => fd.type === 'custom_table_selector' && fd.fieldOptions)
			.map(async (fd) => {
				const opts = fd.fieldOptions;
				try {
					let entities: ResolvedEntity[] = [];
					if (opts.source_type === 'custom_table' && opts.custom_table_id) {
						const tableData = await cachedFetch(`custom_table:${opts.custom_table_id}`, () =>
							pb.collection('custom_table_data').getFullList({
								filter: `table_id = "${opts.custom_table_id}"`,
								requestKey: null
							})
						);
						entities = tableData.map((row: any) => ({
							id: opts.value_field === 'id' ? row.id : (row.row_data?.[opts.value_field] ?? row.id),
							label: row.row_data?.[opts.display_field] ?? row.id
						}));
					} else if (opts.source_type === 'participants') {
						const participants = await cachedFetch(`participants:${projectId}`, () =>
							pb.collection('participants').getFullList({
								filter: `project_id = "${projectId}"`,
								fields: 'id,name,email',
								requestKey: null
							})
						);
						entities = participants.map((p: any) => ({
							id: p.id,
							label: p.name || p.email || p.id
						}));
					} else if (opts.source_type === 'roles') {
						const roles = await cachedFetch(`roles:${projectId}`, () =>
							pb.collection('roles').getFullList({
								filter: `project_id = "${projectId}"`,
								fields: 'id,name',
								requestKey: null
							})
						);
						entities = roles.map((r: any) => ({ id: r.id, label: r.name }));
					} else if (opts.source_type === 'marker_category' && opts.marker_category_id) {
						const markers = await cachedFetch(`markers:${opts.marker_category_id}`, () =>
							pb.collection('markers').getFullList({
								filter: `category_id = "${opts.marker_category_id}"`,
								fields: 'id,title',
								requestKey: null
							})
						);
						entities = markers.map((mk: any) => ({ id: mk.id, label: mk.title || mk.id }));
					}
					result.set(fd.id, entities);
				} catch (err) {
					console.error(`Failed to resolve entities for field ${fd.id}:`, err);
					result.set(fd.id, []);
				}
			})
	);

	return result;
}
