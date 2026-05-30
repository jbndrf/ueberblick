import type PocketBase from 'pocketbase';

export interface ResolvedEntity {
	id: string;
	label: string;
}

type FieldDefLike = {
	id: string;
	field_type?: string;
	field_options?: unknown;
};

/**
 * Resolves the option lists for `custom_table_selector` field defs into
 * `{ id, label }[]` so admin views can render stored IDs as human labels.
 * Sources (custom table / participants / roles / marker category) are fetched
 * once each and shared across fields that point at the same source.
 *
 * Returns a map keyed by field-def id. Fields that fail to resolve get `[]`.
 */
export async function resolveFieldEntities(
	pb: PocketBase,
	fieldDefs: FieldDefLike[],
	projectId: string,
	roles: Array<{ id: string; name: string }>
): Promise<Record<string, ResolvedEntity[]>> {
	const result: Record<string, ResolvedEntity[]> = {};
	const cache = new Map<string, Promise<any[]>>();
	const cachedFetch = (key: string, fetcher: () => Promise<any[]>): Promise<any[]> => {
		let p = cache.get(key);
		if (!p) {
			p = fetcher();
			cache.set(key, p);
		}
		return p;
	};

	await Promise.all(
		fieldDefs
			.filter((fd) => fd.field_type === 'custom_table_selector')
			.map(async (fd) => {
				let opts: any = fd.field_options;
				if (typeof opts === 'string') {
					try {
						opts = JSON.parse(opts);
					} catch {
						opts = null;
					}
				}
				if (!opts) {
					result[fd.id] = [];
					return;
				}
				try {
					if (opts.source_type === 'custom_table' && opts.custom_table_id) {
						const tableData = await cachedFetch(`custom_table:${opts.custom_table_id}`, () =>
							pb.collection('custom_table_data').getFullList({
								filter: `table_id = "${opts.custom_table_id}"`,
								requestKey: null
							})
						);
						result[fd.id] = tableData.map((row: any) => ({
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
						result[fd.id] = participants.map((p: any) => ({
							id: p.id,
							label: p.name || p.email || p.id
						}));
					} else if (opts.source_type === 'roles') {
						result[fd.id] = roles.map((r) => ({ id: r.id, label: r.name }));
					} else if (opts.source_type === 'marker_category' && opts.marker_category_id) {
						const markers = await cachedFetch(`markers:${opts.marker_category_id}`, () =>
							pb.collection('markers').getFullList({
								filter: `category_id = "${opts.marker_category_id}"`,
								fields: 'id,title',
								requestKey: null
							})
						);
						result[fd.id] = markers.map((mk: any) => ({ id: mk.id, label: mk.title || mk.id }));
					} else {
						result[fd.id] = [];
					}
				} catch (err) {
					console.error(`Failed to resolve entities for field ${fd.id}:`, err);
					result[fd.id] = [];
				}
			})
	);

	return result;
}
