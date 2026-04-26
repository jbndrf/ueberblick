/**
 * Whole-project archive: export and import a project's data + schema as a
 * single ZIP containing CSVs, a mapping file, and bundled file uploads.
 *
 * Builds on schema-transfer.ts (which handles the configuration layer) and
 * adds workflow_instances, workflow_instance_field_values,
 * workflow_protocol_entries, workflow_instance_tool_usage, markers,
 * custom_table_data, and participants.
 */
import { zipSync, strToU8, type Zippable } from 'fflate';
import type PocketBase from 'pocketbase';
import {
	exportProjectSchema,
	importProjectSchema,
	generateId,
	type ProjectSchemaExport
} from './schema-transfer';
import { createBatcher } from './pb-batch';
import { getUnzipper } from './unzipper';

// Safety caps for imported archives
const MAX_IMPORT_TOTAL_UNCOMPRESSED = 5 * 1024 * 1024 * 1024; // 5 GB
const MAX_IMPORT_PER_ENTRY_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_IMPORT_COMPRESSION_RATIO = 1000;

type ZipDirectory = Awaited<
	ReturnType<Awaited<ReturnType<typeof getUnzipper>>['Open']['file']>
>;
type ZipEntry = ZipDirectory['files'][number];

export type ImportProgress = (pct: number, label?: string) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArchiveColumnKind = 'system' | 'field' | 'custom_table';
export type ArchiveValueType =
	| 'text'
	| 'number'
	| 'date'
	| 'datetime'
	| 'json'
	| 'geojson'
	| 'wkt'
	| 'lat'
	| 'lon'
	| 'id'
	| 'id_list'
	| 'file_ref'
	| 'file_ref_list';

export type ArchiveColumn = {
	name: string;
	kind: ArchiveColumnKind;
	value_type: ArchiveValueType;
	field_id?: string;
	field_label?: string;
	stage_id?: string;
	system_field?: string;
};

export type ArchiveWorkflowMapping = {
	original_id: string;
	name: string;
	csv_path: string;
	stages: Record<string, { name: string; order: number; slug: string }>;
	columns: ArchiveColumn[];
};

export type ArchiveCustomTableMapping = {
	original_id: string;
	name: string;
	csv_path: string;
	columns: ArchiveColumn[];
};

export type ArchiveMapping = {
	version: 1;
	exported_at: string;
	source_project: { id: string; name: string };
	workflows: ArchiveWorkflowMapping[];
	custom_tables: ArchiveCustomTableMapping[];
	protocol_entries_csv: string;
	tool_usage_csv: string;
	markers_csv: string;
	participants_csv: string | null;
};

export type ArchiveManifest = {
	version: 1;
	exported_at: string;
	app: { name: string; product: 'ueberblick' };
	source_project: { id: string; name: string };
	counts: Record<string, number>;
	files_dir: 'files/';
};

export type ExportOptions = {
	includeParticipants?: boolean;
	includeParticipantTokens?: boolean;
	csvOnly?: boolean;
};

export type ImportResult = {
	projectId: string;
	counts: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const SYSTEM_FIELDS = ['collectionId', 'collectionName', 'created', 'updated'];

function slugify(input: string, fallback = 'unnamed'): string {
	const slug = (input || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || fallback;
}

function uniqueSlug(base: string, taken: Set<string>): string {
	if (!taken.has(base)) {
		taken.add(base);
		return base;
	}
	let n = 2;
	while (taken.has(`${base}-${n}`)) n++;
	const result = `${base}-${n}`;
	taken.add(result);
	return result;
}

function csvEscape(value: unknown): string {
	if (value === null || value === undefined) return '';
	const str = typeof value === 'string' ? value : JSON.stringify(value);
	if (/[",\r\n]/.test(str)) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

function buildCsv(headers: string[], rows: unknown[][]): string {
	const lines: string[] = [headers.map(csvEscape).join(',')];
	for (const row of rows) {
		lines.push(row.map(csvEscape).join(','));
	}
	return lines.join('\n') + '\n';
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
	const lines: string[][] = [];
	let current: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;
	while (i < text.length) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
				} else {
					inQuotes = false;
					i++;
				}
			} else {
				field += c;
				i++;
			}
		} else if (c === '"' && field === '') {
			inQuotes = true;
			i++;
		} else if (c === ',') {
			current.push(field);
			field = '';
			i++;
		} else if (c === '\n' || c === '\r') {
			current.push(field);
			field = '';
			lines.push(current);
			current = [];
			if (c === '\r' && text[i + 1] === '\n') i += 2;
			else i++;
		} else {
			field += c;
			i++;
		}
	}
	if (field !== '' || current.length > 0) {
		current.push(field);
		lines.push(current);
	}
	const filtered = lines.filter((row) => row.some((cell) => cell !== ''));
	if (filtered.length === 0) return { headers: [], rows: [] };
	return { headers: filtered[0], rows: filtered.slice(1) };
}

function geometryToWkt(geo: any): string {
	if (!geo || typeof geo !== 'object') return '';
	const t = geo.type;
	const c = geo.coordinates;
	if (!t || !c) return '';
	const ring = (r: number[][]) => r.map((p) => `${p[0]} ${p[1]}`).join(', ');
	const poly = (p: number[][][]) => `(${p.map((r) => `(${ring(r)})`).join(', ')})`;
	switch (t) {
		case 'Point':
			return `POINT(${c[0]} ${c[1]})`;
		case 'LineString':
			return `LINESTRING(${ring(c)})`;
		case 'Polygon':
			return `POLYGON${poly(c)}`;
		case 'MultiPoint':
			return `MULTIPOINT(${ring(c)})`;
		case 'MultiLineString':
			return `MULTILINESTRING(${c.map((l: number[][]) => `(${ring(l)})`).join(', ')})`;
		case 'MultiPolygon':
			return `MULTIPOLYGON(${c.map(poly).join(', ')})`;
		default:
			return '';
	}
}

async function fetchPbFile(
	pb: PocketBase,
	collection: string,
	recordId: string,
	filename: string
): Promise<Uint8Array | null> {
	try {
		const url = `${pb.baseURL.replace(/\/$/, '')}/api/files/${collection}/${recordId}/${encodeURIComponent(filename)}`;
		const headers: Record<string, string> = {};
		if (pb.authStore.token) headers['Authorization'] = pb.authStore.token;
		const res = await fetch(url, { headers });
		if (!res.ok) return null;
		const buf = new Uint8Array(await res.arrayBuffer());
		return buf;
	} catch {
		return null;
	}
}

function stripSystem(record: any): any {
	const data = { ...record };
	for (const f of SYSTEM_FIELDS) delete data[f];
	return data;
}

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

export async function exportProjectArchive(
	pb: PocketBase,
	projectId: string,
	options: ExportOptions = {}
): Promise<{ filename: string; bytes: Uint8Array }> {
	const project = await pb.collection('projects').getOne(projectId);
	const schema = await exportProjectSchema(pb, projectId);

	const zipFiles: Zippable = {};
	const counts: Record<string, number> = {};
	const mapping: ArchiveMapping = {
		version: 1,
		exported_at: new Date().toISOString(),
		source_project: { id: project.id, name: project.name },
		workflows: [],
		custom_tables: [],
		protocol_entries_csv: 'protocol_entries.csv',
		tool_usage_csv: 'tool_usage.csv',
		markers_csv: 'markers.csv',
		participants_csv: options.includeParticipants ? 'participants.csv' : null
	};

	// Pre-load form fields keyed by id (used to label instance value columns)
	const allFormFields = await pb.collection('tools_form_fields').getFullList({ sort: 'field_order' });
	const fieldById = new Map<string, any>();
	for (const f of allFormFields) fieldById.set(f.id, f);

	const stagesByWorkflow = new Map<string, any[]>();
	for (const wf of schema.workflows) {
		stagesByWorkflow.set(wf.record.id, wf.stages);
	}

	// ---------- workflows: instances + field_values (wide) ----------
	const workflowSlugs = new Set<string>();
	for (const wfExport of schema.workflows) {
		const wfRecord = wfExport.record;
		const wfSlug = uniqueSlug(slugify(wfRecord.name, 'workflow'), workflowSlugs);
		const csvPath = `workflows/${wfSlug}.csv`;

		// Stage lookup with slugs (unique within workflow)
		const stageSlugTaken = new Set<string>();
		const stageInfo: Record<string, { name: string; order: number; slug: string }> = {};
		for (const s of wfExport.stages) {
			stageInfo[s.id] = {
				name: s.name,
				order: s.stage_order ?? 0,
				slug: uniqueSlug(slugify(s.name, 'stage'), stageSlugTaken)
			};
		}

		// Determine fields used by this workflow's forms and order them by stage then field_order
		const formIds = new Set(wfExport.forms.map((f: any) => f.id));
		const wfFields = wfExport.form_fields
			.filter((f: any) => formIds.has(f.form_id))
			.slice()
			.sort((a: any, b: any) => (a.field_order ?? 0) - (b.field_order ?? 0));

		// A field belongs to a form which belongs to a stage (form.stage_id) -- may be null for non-stage forms.
		const formStageId = new Map<string, string | null>();
		for (const form of wfExport.forms) {
			formStageId.set(form.id, form.stage_id || null);
		}

		// Build column list with disambiguation
		const colNameTaken = new Set<string>();
		const sysCols: ArchiveColumn[] = [
			{ name: 'id', kind: 'system', value_type: 'id', system_field: 'id' },
			{ name: 'status', kind: 'system', value_type: 'text', system_field: 'status' },
			{
				name: 'current_stage_id',
				kind: 'system',
				value_type: 'id',
				system_field: 'current_stage_id'
			},
			{ name: 'created_by', kind: 'system', value_type: 'id', system_field: 'created_by' },
			{ name: 'created', kind: 'system', value_type: 'datetime', system_field: 'created' },
			{
				name: 'last_activity_at',
				kind: 'system',
				value_type: 'datetime',
				system_field: 'last_activity_at'
			},
			{ name: 'centroid_lat', kind: 'system', value_type: 'lat', system_field: 'centroid' },
			{ name: 'centroid_lon', kind: 'system', value_type: 'lon', system_field: 'centroid' },
			{ name: 'geometry_wkt', kind: 'system', value_type: 'wkt', system_field: 'geometry' },
			{
				name: 'geometry_geojson',
				kind: 'system',
				value_type: 'geojson',
				system_field: 'geometry'
			},
			{ name: 'bbox_json', kind: 'system', value_type: 'json', system_field: 'bbox' },
			{ name: 'files', kind: 'system', value_type: 'file_ref_list', system_field: 'files' }
		];
		for (const c of sysCols) colNameTaken.add(c.name);

		const fieldCols: ArchiveColumn[] = [];
		for (const field of wfFields) {
			const stageId = formStageId.get(field.form_id) || null;
			const stageSlug = stageId && stageInfo[stageId] ? stageInfo[stageId].slug : null;
			const baseSlug = slugify(field.field_label, field.id);
			let colBase = baseSlug;
			let colName: string;
			if (colNameTaken.has(colBase) && stageSlug) {
				colName = uniqueSlug(`${baseSlug}__${stageSlug}`, colNameTaken);
			} else {
				colName = uniqueSlug(colBase, colNameTaken);
			}
			fieldCols.push({
				name: colName,
				kind: 'field',
				value_type: field.field_type === 'file' ? 'file_ref' : 'text',
				field_id: field.id,
				field_label: field.field_label,
				stage_id: stageId || undefined
			});
		}

		const allCols = [...sysCols, ...fieldCols];

		// Load instances + field values for this workflow
		const instances = await pb
			.collection('workflow_instances')
			.getFullList({ filter: `workflow_id = "${wfRecord.id}"`, sort: 'created' });

		const valuesByInstance = new Map<string, Map<string, any[]>>();
		if (instances.length > 0) {
			const vals = await pb.collection('workflow_instance_field_values').getFullList({
				filter: `instance_id.workflow_id = "${wfRecord.id}"`,
				requestKey: null
			});
			for (const v of vals) {
				if (!valuesByInstance.has(v.instance_id)) valuesByInstance.set(v.instance_id, new Map());
				const perField = valuesByInstance.get(v.instance_id)!;
				if (!perField.has(v.field_key)) perField.set(v.field_key, []);
				perField.get(v.field_key)!.push(v);
			}
		}

		// Build CSV rows + collect file uploads
		const rows: unknown[][] = [];
		for (const inst of instances) {
			const valueMap = valuesByInstance.get(inst.id) ?? new Map();
			const row: unknown[] = [];

			// Instance attachment files
			const instanceFiles: string[] = Array.isArray(inst.files) ? inst.files : [];
			const instanceFilePaths: string[] = [];
			for (const fname of instanceFiles) {
				const path = `files/instances/${inst.id}/_instance/${fname}`;
				instanceFilePaths.push(path);
				if (options.csvOnly) continue;
				const bytes = await fetchPbFile(pb, 'workflow_instances', inst.id, fname);
				if (bytes) zipFiles[path] = bytes;
			}

			for (const col of sysCols) {
				switch (col.system_field) {
					case 'id':
						row.push(inst.id);
						break;
					case 'status':
						row.push(inst.status);
						break;
					case 'current_stage_id':
						row.push(inst.current_stage_id);
						break;
					case 'created_by':
						row.push(inst.created_by ?? '');
						break;
					case 'created':
						row.push(inst.created);
						break;
					case 'last_activity_at':
						row.push(inst.last_activity_at ?? '');
						break;
					case 'centroid':
						if (col.name === 'centroid_lat') row.push(inst.centroid?.lat ?? '');
						else row.push(inst.centroid?.lon ?? '');
						break;
					case 'geometry':
						if (col.name === 'geometry_wkt') row.push(geometryToWkt(inst.geometry));
						else row.push(inst.geometry ? JSON.stringify(inst.geometry) : '');
						break;
					case 'bbox':
						row.push(inst.bbox ? JSON.stringify(inst.bbox) : '');
						break;
					case 'files':
						row.push(instanceFilePaths.join(';'));
						break;
				}
			}

			// Field columns
			for (const col of fieldCols) {
				const arr = valueMap.get(col.field_id!) ?? [];
				if (arr.length === 0) {
					row.push('');
					continue;
				}
				if (col.value_type === 'file_ref') {
					const paths: string[] = [];
					for (const v of arr) {
						if (!v.file_value) continue;
						const fname = v.file_value;
						const path = `files/instances/${inst.id}/${col.field_id}/${fname}`;
						if (options.csvOnly) {
							paths.push(path);
							continue;
						}
						const bytes = await fetchPbFile(
							pb,
							'workflow_instance_field_values',
							v.id,
							fname
						);
						if (bytes) {
							zipFiles[path] = bytes;
							paths.push(path);
						}
					}
					row.push(paths.join(';'));
				} else {
					row.push(arr[0].value ?? '');
				}
			}

			rows.push(row);
		}

		const csv = buildCsv(allCols.map((c) => c.name), rows);
		zipFiles[csvPath] = strToU8(csv);
		counts[`workflow_instances:${wfRecord.name}`] = instances.length;

		mapping.workflows.push({
			original_id: wfRecord.id,
			name: wfRecord.name,
			csv_path: csvPath,
			stages: stageInfo,
			columns: allCols
		});
	}

	// ---------- protocol_entries.csv ----------
	{
		const entries = await pb.collection('workflow_protocol_entries').getFullList({
			filter: schema.workflows
				.map((w: any) => `instance_id.workflow_id = "${w.record.id}"`)
				.join(' || ') || 'id = ""',
			sort: 'created'
		});
		const headers = [
			'id',
			'instance_id',
			'stage_id',
			'tool_id',
			'recorded_by',
			'recorded_at',
			'snapshot_hash',
			'snapshot_json',
			'field_values_json',
			'files'
		];
		const rows: unknown[][] = [];
		for (const e of entries) {
			const filePaths: string[] = [];
			for (const fname of (e.files || []) as string[]) {
				const path = `files/protocols/${e.id}/${fname}`;
				filePaths.push(path);
				if (options.csvOnly) continue;
				const bytes = await fetchPbFile(pb, 'workflow_protocol_entries', e.id, fname);
				if (bytes) zipFiles[path] = bytes;
			}
			rows.push([
				e.id,
				e.instance_id,
				e.stage_id,
				e.tool_id ?? '',
				e.recorded_by ?? '',
				e.recorded_at,
				e.snapshot_hash ?? '',
				e.snapshot ? JSON.stringify(e.snapshot) : '',
				e.field_values ? JSON.stringify(e.field_values) : '',
				filePaths.join(';')
			]);
		}
		zipFiles['protocol_entries.csv'] = strToU8(buildCsv(headers, rows));
		counts['protocol_entries'] = entries.length;
	}

	// ---------- tool_usage.csv ----------
	{
		const usage = await pb.collection('workflow_instance_tool_usage').getFullList({
			filter: schema.workflows
				.map((w: any) => `instance_id.workflow_id = "${w.record.id}"`)
				.join(' || ') || 'id = ""',
			sort: 'executed_at'
		});
		const headers = [
			'id',
			'instance_id',
			'stage_id',
			'executed_by',
			'executed_at',
			'metadata_json'
		];
		const rows = usage.map((u: any) => [
			u.id,
			u.instance_id,
			u.stage_id ?? '',
			u.executed_by ?? '',
			u.executed_at,
			u.metadata ? JSON.stringify(u.metadata) : ''
		]);
		zipFiles['tool_usage.csv'] = strToU8(buildCsv(headers, rows));
		counts['tool_usage'] = usage.length;
	}

	// ---------- markers.csv ----------
	{
		const markers = await pb
			.collection('markers')
			.getFullList({ filter: `project_id = "${projectId}"`, sort: 'created' });
		const headers = [
			'id',
			'category_id',
			'title',
			'description',
			'lat',
			'lon',
			'properties_json',
			'visible_to_roles',
			'created_by',
			'created'
		];
		const rows = markers.map((m: any) => [
			m.id,
			m.category_id,
			m.title,
			m.description ?? '',
			m.location?.lat ?? '',
			m.location?.lon ?? '',
			m.properties ? JSON.stringify(m.properties) : '',
			Array.isArray(m.visible_to_roles) ? m.visible_to_roles.join(';') : '',
			m.created_by ?? '',
			m.created
		]);
		zipFiles['markers.csv'] = strToU8(buildCsv(headers, rows));
		counts['markers'] = markers.length;
	}

	// ---------- custom_tables/*.csv ----------
	const tableSlugs = new Set<string>();
	for (const tableExport of schema.custom_tables) {
		const tableSlug = uniqueSlug(slugify(tableExport.record.name, 'table'), tableSlugs);
		const csvPath = `custom_tables/${tableSlug}.csv`;
		const cols = tableExport.columns
			.slice()
			.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
		const headers = ['id', ...cols.map((c: any) => c.column_key || c.name || c.id)];
		const data = await pb
			.collection('custom_table_data')
			.getFullList({ filter: `table_id = "${tableExport.record.id}"`, sort: 'created' });
		const rows = data.map((row: any) => {
			const out: unknown[] = [row.id];
			for (const col of cols) {
				const key = col.column_key || col.name || col.id;
				const v = row.row_data?.[key];
				out.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : (v ?? ''));
			}
			return out;
		});
		zipFiles[csvPath] = strToU8(buildCsv(headers, rows));
		counts[`custom_table:${tableExport.record.name}`] = data.length;

		const colDefs: ArchiveColumn[] = [
			{ name: 'id', kind: 'system', value_type: 'id', system_field: 'id' },
			...cols.map(
				(c: any): ArchiveColumn => ({
					name: c.column_key || c.name || c.id,
					kind: 'custom_table',
					value_type: 'text',
					field_id: c.id
				})
			)
		];
		mapping.custom_tables.push({
			original_id: tableExport.record.id,
			name: tableExport.record.name,
			csv_path: csvPath,
			columns: colDefs
		});
	}

	// ---------- participants.csv (optional) ----------
	if (options.includeParticipants) {
		const participants = await pb
			.collection('participants')
			.getFullList({ filter: `project_id = "${projectId}"`, sort: 'created' });
		const headers = [
			'id',
			'name',
			'email',
			'phone',
			'role_ids',
			'is_active',
			'expires_at',
			'token',
			'metadata_json'
		];
		const rows = participants.map((p: any) => [
			p.id,
			p.name,
			p.email,
			p.phone ?? '',
			Array.isArray(p.role_id) ? p.role_id.join(';') : '',
			p.is_active ? 'true' : 'false',
			p.expires_at ?? '',
			options.includeParticipantTokens ? (p.token ?? '') : '',
			p.metadata ? JSON.stringify(p.metadata) : ''
		]);
		zipFiles['participants.csv'] = strToU8(buildCsv(headers, rows));
		counts['participants'] = participants.length;
	}

	// ---------- schema.json + mapping.json + manifest.json ----------
	if (!options.csvOnly) {
		zipFiles['schema.json'] = strToU8(JSON.stringify(schema, null, 2));
		zipFiles['mapping.json'] = strToU8(JSON.stringify(mapping, null, 2));

		const manifest: ArchiveManifest = {
			version: 1,
			exported_at: mapping.exported_at,
			app: { name: 'Überblick', product: 'ueberblick' },
			source_project: { id: project.id, name: project.name },
			counts,
			files_dir: 'files/'
		};
		zipFiles['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
	}

	const bytes = zipSync(zipFiles, { level: 6 });
	const suffix = options.csvOnly ? '-data' : '';
	const filename = `${slugify(project.name, 'project')}-${new Date().toISOString().slice(0, 10)}${suffix}.zip`;
	return { filename, bytes };
}

// ---------------------------------------------------------------------------
// IMPORT
// ---------------------------------------------------------------------------

type ZipIndex = Map<string, ZipEntry>;

function buildZipIndex(directory: ZipDirectory): ZipIndex {
	const idx: ZipIndex = new Map();
	for (const f of directory.files) {
		if (f.type === 'File') idx.set(f.path, f);
	}
	return idx;
}

async function readEntryText(index: ZipIndex, path: string): Promise<string | null> {
	const entry = index.get(path);
	if (!entry) return null;
	const buf = await entry.buffer();
	return buf.toString('utf8');
}

async function readEntryJson<T>(index: ZipIndex, path: string): Promise<T> {
	const text = await readEntryText(index, path);
	if (text === null) throw new Error(`Missing archive entry: ${path}`);
	return JSON.parse(text);
}

async function readEntryAsFile(
	index: ZipIndex,
	path: string,
	filename: string
): Promise<File | null> {
	const entry = index.get(path);
	if (!entry) return null;
	const buf = await entry.buffer();
	const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
	return new File([bytes as BlobPart], filename);
}

export async function importProjectArchive(
	pb: PocketBase,
	zipPath: string,
	ownerId: string,
	nameOverride?: string,
	onProgress?: ImportProgress
): Promise<ImportResult> {
	const progress = async (pct: number, label?: string) => {
		if (onProgress) await onProgress(Math.max(0, Math.min(100, Math.round(pct))), label);
	};

	await progress(2, 'Reading archive');
	const uz = await getUnzipper();
	const directory = await uz.Open.file(zipPath);

	// Size-cap validation from central directory metadata (before any decompression).
	let totalUncompressed = 0;
	for (const f of directory.files) {
		if (f.type !== 'File') continue;
		const size = f.uncompressedSize || 0;
		if (size > MAX_IMPORT_PER_ENTRY_SIZE) {
			throw new Error(
				`Archive entry ${f.path} size ${size} exceeds per-entry limit ${MAX_IMPORT_PER_ENTRY_SIZE}`
			);
		}
		if (f.compressedSize && size) {
			const ratio = size / f.compressedSize;
			if (ratio > MAX_IMPORT_COMPRESSION_RATIO) {
				throw new Error(
					`Archive entry ${f.path} compression ratio ${ratio.toFixed(0)}:1 exceeds limit ${MAX_IMPORT_COMPRESSION_RATIO}:1`
				);
			}
		}
		totalUncompressed += size;
	}
	if (totalUncompressed > MAX_IMPORT_TOTAL_UNCOMPRESSED) {
		throw new Error(
			`Archive total uncompressed size ${totalUncompressed} exceeds limit ${MAX_IMPORT_TOTAL_UNCOMPRESSED}`
		);
	}

	const zip = buildZipIndex(directory);

	const manifest = await readEntryJson<ArchiveManifest>(zip, 'manifest.json');
	if (manifest.version !== 1) throw new Error(`Unsupported archive version: ${manifest.version}`);
	const mapping = await readEntryJson<ArchiveMapping>(zip, 'mapping.json');
	const schema = await readEntryJson<ProjectSchemaExport>(zip, 'schema.json');

	// 1. Create project + config via existing schema importer.
	await progress(5, 'Importing schema');
	const newProjectId = await importProjectSchema(pb, schema, ownerId, nameOverride);
	await progress(15, 'Schema imported');

	// Build ID maps from old → new by fetching everything we just created and matching by name+order.
	// Simpler approach: re-derive by querying new project + comparing structure to schema/mapping.
	const idMaps = await rebuildIdMapsFromImport(pb, newProjectId, schema);

	const counts: Record<string, number> = {};

	// 1b. Participants (must run before instances/protocols so created_by/recorded_by can remap)
	{
		const csvText = await readEntryText(zip, 'participants.csv');
		if (csvText) {
			const { headers, rows } = parseCsv(csvText);
			const idx = (n: string) => headers.indexOf(n);
			const existing = await pb
				.collection('participants')
				.getFullList({ fields: 'email' });
			const usedEmails = new Set(existing.map((p: any) => p.email).filter(Boolean));
			const batcher = createBatcher(pb);
			let count = 0;
			for (const row of rows) {
				const oldId = row[idx('id')];
				const newId = generateId();
				idMaps.participants.set(oldId, newId);

				let email = row[idx('email')] || `${newId}@imported.local`;
				if (usedEmails.has(email)) {
					const [local, domain] = email.split('@');
					let n = 2;
					while (usedEmails.has(`${local}+imported-${n}@${domain}`)) n++;
					email = `${local}+imported-${n}@${domain}`;
				}
				usedEmails.add(email);

				const roles = (row[idx('role_ids')] || '')
					.split(';')
					.filter(Boolean)
					.map((r) => idMaps.roles.get(r) || r);

				const token = row[idx('token')] || generateId() + generateId();
				const data: any = {
					id: newId,
					project_id: newProjectId,
					name: row[idx('name')] || 'Imported participant',
					phone: row[idx('phone')] || '',
					token,
					is_active: row[idx('is_active')] === 'true',
					email,
					emailVisibility: false,
					password: token,
					passwordConfirm: token,
					role_id: roles
				};
				const expires = row[idx('expires_at')];
				if (expires) data.expires_at = expires;
				const md = row[idx('metadata_json')];
				if (md) {
					try {
						data.metadata = JSON.parse(md);
					} catch {
						/* ignore */
					}
				}

				await batcher.add('participants', data);
				count++;
			}
			await batcher.flush();
			counts['participants'] = count;
			await progress(25, `Imported ${count} participants`);
		}
	}

	// 2. Workflow instances + field_values per workflow CSV
	const workflowCount = mapping.workflows.length || 1;
	let workflowIdx = 0;
	for (const wfMap of mapping.workflows) {
		const newWorkflowId = idMaps.workflows.get(wfMap.original_id);
		if (!newWorkflowId) continue;
		const csvText = await readEntryText(zip, wfMap.csv_path);
		if (!csvText) continue;
		const { headers, rows } = parseCsv(csvText);
		const colByName = new Map(wfMap.columns.map((c) => [c.name, c]));
		const headerCols = headers.map((h) => colByName.get(h));

		const batcher = createBatcher(pb);
		let instanceCount = 0;
		let valueCount = 0;
		for (const row of rows) {
			const get = (name: string) => {
				const idx = headers.indexOf(name);
				return idx >= 0 ? row[idx] : '';
			};

			const oldInstanceId = get('id');
			const newInstanceId = generateId();
			idMaps.instances.set(oldInstanceId, newInstanceId);

			const oldStageId = get('current_stage_id');
			const newStageId = idMaps.stages.get(oldStageId) || oldStageId;
			const oldCreatedBy = get('created_by');
			const newCreatedBy = oldCreatedBy ? idMaps.participants.get(oldCreatedBy) || null : null;

			const formData = new FormData();
			formData.append('id', newInstanceId);
			formData.append('workflow_id', newWorkflowId);
			formData.append('current_stage_id', newStageId);
			formData.append('status', get('status') || 'active');
			if (newCreatedBy) formData.append('created_by', newCreatedBy);
			const lastAct = get('last_activity_at');
			if (lastAct) formData.append('last_activity_at', lastAct);

			const geojson = get('geometry_geojson');
			if (geojson) formData.append('geometry', geojson);

			const lat = get('centroid_lat');
			const lon = get('centroid_lon');
			if (lat && lon) {
				formData.append('centroid', JSON.stringify({ lat: Number(lat), lon: Number(lon) }));
			}
			const bbox = get('bbox_json');
			if (bbox) formData.append('bbox', bbox);

			let instanceHadFiles = false;
			const fileRefs = (get('files') || '').split(';').filter(Boolean);
			for (const ref of fileRefs) {
				const fname = ref.split('/').pop() || 'file';
				const file = await readEntryAsFile(zip, ref, fname);
				if (file) {
					formData.append('files', file);
					instanceHadFiles = true;
				}
			}

			await batcher.add('workflow_instances', formData);
			instanceCount++;

			// Field values
			for (let i = 0; i < headers.length; i++) {
				const col = headerCols[i];
				if (!col || col.kind !== 'field' || !col.field_id) continue;
				const cell = row[i];
				if (!cell) continue;

				const newFieldId = idMaps.formFields.get(col.field_id) || col.field_id;
				const newValStageId = col.stage_id
					? idMaps.stages.get(col.stage_id) || col.stage_id
					: newStageId;

				if (col.value_type === 'file_ref') {
					const refs = cell.split(';').filter(Boolean);
					for (const ref of refs) {
						const fname = ref.split('/').pop() || 'file';
						const file = await readEntryAsFile(zip, ref, fname);
						if (!file) continue;
						const fd = new FormData();
						fd.append('id', generateId());
						fd.append('instance_id', newInstanceId);
						fd.append('field_key', newFieldId);
						fd.append('stage_id', newValStageId);
						fd.append('value', '');
						fd.append('file_value', file);
						await batcher.add('workflow_instance_field_values', fd);
						valueCount++;
						instanceHadFiles = true;
					}
				} else {
					const fd = new FormData();
					fd.append('id', generateId());
					fd.append('instance_id', newInstanceId);
					fd.append('field_key', newFieldId);
					fd.append('stage_id', newValStageId);
					fd.append('value', cell);
					await batcher.add('workflow_instance_field_values', fd);
					valueCount++;
				}
			}

			// Cap in-flight memory: flush immediately if this instance attached any
			// files so their decompressed bytes can be GC'd before the next row.
			if (instanceHadFiles) await batcher.flush();
		}
		await batcher.flush();
		counts[`workflow_instances:${wfMap.name}`] = instanceCount;
		counts[`field_values:${wfMap.name}`] = valueCount;
		workflowIdx++;
		await progress(
			25 + (workflowIdx / workflowCount) * 40,
			`Imported ${instanceCount} instances (${wfMap.name})`
		);
	}

	// 3. Protocol entries
	{
		const csvText = await readEntryText(zip, 'protocol_entries.csv');
		if (csvText) {
			const { headers, rows } = parseCsv(csvText);
			const idx = (n: string) => headers.indexOf(n);
			const batcher = createBatcher(pb);
			let count = 0;
			for (const row of rows) {
				const oldId = row[idx('id')];
				const oldInstId = row[idx('instance_id')];
				const oldStageId = row[idx('stage_id')];
				const oldToolId = row[idx('tool_id')];
				const oldRecorder = row[idx('recorded_by')];
				const newInstId = idMaps.instances.get(oldInstId);
				if (!newInstId) continue;

				const newId = generateId();
				const fd = new FormData();
				fd.append('id', newId);
				fd.append('instance_id', newInstId);
				fd.append('stage_id', idMaps.stages.get(oldStageId) || oldStageId);
				if (oldToolId) {
					const newToolId = idMaps.protocolTools.get(oldToolId);
					if (newToolId) fd.append('tool_id', newToolId);
				}
				if (oldRecorder) {
					const newRec = idMaps.participants.get(oldRecorder);
					if (newRec) fd.append('recorded_by', newRec);
				}
				fd.append('recorded_at', row[idx('recorded_at')]);
				fd.append('snapshot_hash', row[idx('snapshot_hash')] || '');
				const snap = row[idx('snapshot_json')];
				fd.append('snapshot', snap || '{}');
				const fv = row[idx('field_values_json')];
				if (fv) fd.append('field_values', fv);
				const files = (row[idx('files')] || '').split(';').filter(Boolean);
				let entryHadFiles = false;
				for (const ref of files) {
					const fname = ref.split('/').pop() || 'file';
					const f = await readEntryAsFile(zip, ref, fname);
					if (f) {
						fd.append('files', f);
						entryHadFiles = true;
					}
				}
				await batcher.add('workflow_protocol_entries', fd);
				count++;
				if (entryHadFiles) await batcher.flush();
			}
			await batcher.flush();
			counts['protocol_entries'] = count;
			await progress(75, `Imported ${count} protocol entries`);
		}
	}

	// 4. Tool usage
	{
		const csvText = await readEntryText(zip, 'tool_usage.csv');
		if (csvText) {
			const { headers, rows } = parseCsv(csvText);
			const idx = (n: string) => headers.indexOf(n);
			const batcher = createBatcher(pb);
			let count = 0;
			for (const row of rows) {
				const oldInstId = row[idx('instance_id')];
				const newInstId = idMaps.instances.get(oldInstId);
				if (!newInstId) continue;
				const data: any = {
					id: generateId(),
					instance_id: newInstId,
					executed_at: row[idx('executed_at')]
				};
				const stage = row[idx('stage_id')];
				if (stage) data.stage_id = idMaps.stages.get(stage) || stage;
				const exec = row[idx('executed_by')];
				if (exec) {
					const newExec = idMaps.participants.get(exec);
					if (newExec) data.executed_by = newExec;
				}
				const md = row[idx('metadata_json')];
				if (md) data.metadata = JSON.parse(md);
				await batcher.add('workflow_instance_tool_usage', data);
				count++;
			}
			await batcher.flush();
			counts['tool_usage'] = count;
			await progress(82, `Imported ${count} tool usages`);
		}
	}

	// 5. Markers
	{
		const csvText = await readEntryText(zip, 'markers.csv');
		if (csvText) {
			const { headers, rows } = parseCsv(csvText);
			const idx = (n: string) => headers.indexOf(n);
			const batcher = createBatcher(pb);
			let count = 0;
			for (const row of rows) {
				const oldCat = row[idx('category_id')];
				const newCat = idMaps.markerCategories.get(oldCat) || oldCat;
				const data: any = {
					id: generateId(),
					project_id: newProjectId,
					category_id: newCat,
					title: row[idx('title')],
					description: row[idx('description')] || ''
				};
				const lat = row[idx('lat')];
				const lon = row[idx('lon')];
				if (lat && lon) data.location = { lat: Number(lat), lon: Number(lon) };
				const props = row[idx('properties_json')];
				if (props) data.properties = JSON.parse(props);
				const roles = (row[idx('visible_to_roles')] || '').split(';').filter(Boolean);
				if (roles.length) data.visible_to_roles = roles.map((r) => idMaps.roles.get(r) || r);
				const oldCreatedBy = row[idx('created_by')];
				if (oldCreatedBy) {
					const newCb = idMaps.participants.get(oldCreatedBy);
					if (newCb) data.created_by = newCb;
				}
				await batcher.add('markers', data);
				count++;
			}
			await batcher.flush();
			counts['markers'] = count;
			await progress(90, `Imported ${count} markers`);
		}
	}

	// 6. Custom table data
	for (const tableMap of mapping.custom_tables) {
		const csvText = await readEntryText(zip, tableMap.csv_path);
		if (!csvText) continue;
		const newTableId = idMaps.customTables.get(tableMap.original_id);
		if (!newTableId) continue;
		const { headers, rows } = parseCsv(csvText);
		const dataCols = headers.filter((h) => h !== 'id');
		const batcher = createBatcher(pb);
		let count = 0;
		for (const row of rows) {
			const rowData: Record<string, any> = {};
			for (const colName of dataCols) {
				const idx = headers.indexOf(colName);
				const cell = row[idx];
				if (cell === '') continue;
				try {
					rowData[colName] = cell.startsWith('{') || cell.startsWith('[') ? JSON.parse(cell) : cell;
				} catch {
					rowData[colName] = cell;
				}
			}
			await batcher.add('custom_table_data', {
				id: generateId(),
				table_id: newTableId,
				row_data: rowData
			});
			count++;
		}
		await batcher.flush();
		counts[`custom_table:${tableMap.name}`] = count;
	}

	await progress(100, 'Import complete');
	return { projectId: newProjectId, counts };
}

// ---------------------------------------------------------------------------
// ID map reconstruction
// ---------------------------------------------------------------------------

type ImportIdMaps = {
	workflows: Map<string, string>;
	stages: Map<string, string>;
	formFields: Map<string, string>;
	protocolTools: Map<string, string>;
	roles: Map<string, string>;
	markerCategories: Map<string, string>;
	customTables: Map<string, string>;
	participants: Map<string, string>;
	instances: Map<string, string>;
};

async function rebuildIdMapsFromImport(
	pb: PocketBase,
	newProjectId: string,
	schema: ProjectSchemaExport
): Promise<ImportIdMaps> {
	const maps: ImportIdMaps = {
		workflows: new Map(),
		stages: new Map(),
		formFields: new Map(),
		protocolTools: new Map(),
		roles: new Map(),
		markerCategories: new Map(),
		customTables: new Map(),
		participants: new Map(),
		instances: new Map()
	};

	// Roles: match by name within new project
	const newRoles = await pb
		.collection('roles')
		.getFullList({ filter: `project_id = "${newProjectId}"` });
	const newRolesByName = new Map(newRoles.map((r: any) => [r.name, r.id]));
	for (const r of schema.roles) {
		const id = newRolesByName.get(r.name);
		if (id) maps.roles.set(r.id, id);
	}

	// Marker categories
	const newCats = await pb
		.collection('marker_categories')
		.getFullList({ filter: `project_id = "${newProjectId}"` });
	const newCatsByName = new Map(newCats.map((c: any) => [c.name, c.id]));
	for (const c of schema.marker_categories) {
		const id = newCatsByName.get(c.name);
		if (id) maps.markerCategories.set(c.id, id);
	}

	// Custom tables
	const newTables = await pb
		.collection('custom_tables')
		.getFullList({ filter: `project_id = "${newProjectId}"` });
	const newTablesByName = new Map(newTables.map((t: any) => [t.name, t.id]));
	for (const t of schema.custom_tables) {
		const id = newTablesByName.get(t.record.name);
		if (id) maps.customTables.set(t.record.id, id);
	}

	// Workflows + stages + forms + form fields + protocol tools
	const newWorkflows = await pb
		.collection('workflows')
		.getFullList({ filter: `project_id = "${newProjectId}"` });
	const newWorkflowsByName = new Map(newWorkflows.map((w: any) => [w.name, w.id]));
	for (const wfExport of schema.workflows) {
		const newWfId = newWorkflowsByName.get(wfExport.record.name);
		if (!newWfId) continue;
		maps.workflows.set(wfExport.record.id, newWfId);

		const newStages = await pb
			.collection('workflow_stages')
			.getFullList({ filter: `workflow_id = "${newWfId}"`, sort: 'stage_order' });
		// Match stages by stage_order (stable, set by importProjectSchema)
		const oldStagesByOrder = new Map(wfExport.stages.map((s: any) => [s.stage_order, s]));
		for (const ns of newStages) {
			const os = oldStagesByOrder.get(ns.stage_order);
			if (os) maps.stages.set(os.id, ns.id);
		}

		const newForms = await pb
			.collection('tools_forms')
			.getFullList({ filter: `workflow_id = "${newWfId}"` });
		const newFormsByName = new Map(newForms.map((f: any) => [f.name, f.id]));
		const oldFormToNewForm = new Map<string, string>();
		for (const oldForm of wfExport.forms) {
			const newFormId = newFormsByName.get(oldForm.name);
			if (newFormId) oldFormToNewForm.set(oldForm.id, newFormId);
		}

		// Form fields: match within form by field_order
		const oldFieldsByForm = new Map<string, any[]>();
		for (const ff of wfExport.form_fields) {
			if (!oldFieldsByForm.has(ff.form_id)) oldFieldsByForm.set(ff.form_id, []);
			oldFieldsByForm.get(ff.form_id)!.push(ff);
		}
		for (const [oldFormId, oldFields] of oldFieldsByForm) {
			const newFormId = oldFormToNewForm.get(oldFormId);
			if (!newFormId) continue;
			const newFields = await pb
				.collection('tools_form_fields')
				.getFullList({ filter: `form_id = "${newFormId}"`, sort: 'field_order' });
			const sortedOld = oldFields.slice().sort((a, b) => (a.field_order ?? 0) - (b.field_order ?? 0));
			for (let i = 0; i < sortedOld.length && i < newFields.length; i++) {
				maps.formFields.set(sortedOld[i].id, newFields[i].id);
			}
		}

		// Protocol tools: match by name
		const newProtocols = await pb.collection('tools_protocol').getFullList();
		const newProtosByName = new Map(
			newProtocols
				.filter((p: any) => Array.isArray(p.stage_id) && p.stage_id.some((sid: string) => newStages.find((ns: any) => ns.id === sid)))
				.map((p: any) => [p.name, p.id])
		);
		for (const oldProto of wfExport.protocol_tools || []) {
			const id = newProtosByName.get(oldProto.name);
			if (id) maps.protocolTools.set(oldProto.id, id);
		}
	}

	// Participants: not recreated by schema importer, so map is empty unless we add them later.
	return maps;
}
