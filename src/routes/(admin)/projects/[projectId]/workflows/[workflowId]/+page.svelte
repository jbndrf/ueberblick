<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import { RefreshCw, Hammer, MapPin, FileText, Palette, Upload } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import DataViewerHeader from '$lib/components/admin/data-viewer-header.svelte';
	import WorkflowIconDesigner from '$lib/components/admin/workflow-icon-designer.svelte';
	import { getPocketBase } from '$lib/pocketbase';
	import { POCKETBASE_URL } from '$lib/config/pocketbase';
	import { CsvImportDialog, type MappedImportData, type TargetField, type SpecialColumn, type ImportProgressCallback } from '$lib/components/csv-import';
	import {
		buildRowsFromInstances,
		buildStageNameMap,
		fetchCreatorNameMap,
		fetchFieldValuesForInstances,
		type FieldValueRecord,
		type InstanceRow
	} from '$lib/admin/workflow-rows';

	type FieldDef = {
		id: string;
		label: string;
		type: string;
		fieldOptions: any;
		resolvedEntities?: Array<{ id: string; label: string }>;
	};

	let { data }: { data: PageData } = $props();

	let tableRef: BaseTable<InstanceRow>;
	let lightboxOpen = $state(false);
	let lightboxUrl = $state('');

	// Progressive row loading: server returns the first page of instances in
	// data.initialRows; the rest stream in from the PocketBase client after mount.
	let rows = $state<InstanceRow[]>(data.initialRows);
	let totalRows = $state(data.totalInstances);
	let loadingMore = $state(false);
	let loadVersion = 0;

	async function loadRemainingRows(version: number, workflowId: string, perPage: number) {
		loadingMore = true;
		try {
			const pb = getPocketBase();
			const stageNameById = buildStageNameMap(data.stages as any);
			let currentPage = 2;
			while (true) {
				if (version !== loadVersion) return;
				if (rows.length >= totalRows) break;

				const result = await pb.collection('workflow_instances').getList(currentPage, perPage, {
					filter: `workflow_id = "${workflowId}"`,
					sort: '-created'
				});
				if (version !== loadVersion) return;
				if (result.items.length === 0) break;

				const [fvs, creatorNameById] = await Promise.all([
					fetchFieldValuesForInstances(
						pb,
						result.items.map((i: any) => i.id)
					),
					fetchCreatorNameMap(
						pb,
						result.items.map((i: any) => i.created_by)
					)
				]);
				if (version !== loadVersion) return;

				const newRows = buildRowsFromInstances(result.items, fvs, {
					stageNameById,
					creatorNameById
				});
				rows = [...rows, ...newRows];
				totalRows = result.totalItems;
				currentPage++;
			}
		} catch (err) {
			console.error('Failed to load remaining rows:', err);
			toast.error('Failed to load all rows');
		} finally {
			if (version === loadVersion) loadingMore = false;
		}
	}

	// Tracked with a plain variable (not $state) so it does not participate in
	// reactivity. The $effect re-fires on data-object replacement during
	// hydration / invalidation even when nothing relevant changed -- without
	// this guard we were firing the background pagination 2-3x on first load.
	let loadedForWorkflowId = '';

	$effect(() => {
		const workflowId = data.workflow.id;
		if (loadedForWorkflowId === workflowId) return;
		loadedForWorkflowId = workflowId;

		const initial = data.initialRows;
		const total = data.totalInstances;
		const perPage = data.instancePageSize;

		const myVersion = ++loadVersion;
		rows = [...initial];
		totalRows = total;

		if (rows.length < total) {
			loadRemainingRows(myVersion, workflowId, perPage);
		}
	});

	const globalFilterFn = (row: any, _columnId: string, filterValue: string) => {
		if (!filterValue) return true;
		const searchValue = String(filterValue).toLowerCase();
		const inst = row.original;
		return (
			inst.status?.toLowerCase().includes(searchValue) ||
			inst.current_stage_name?.toLowerCase().includes(searchValue) ||
			inst.created_by_name?.toLowerCase().includes(searchValue) ||
			Object.values(inst.fieldData).some((value) => {
				if (Array.isArray(value)) return value.some((v: any) => String(v).toLowerCase().includes(searchValue));
				return String(value ?? '').toLowerCase().includes(searchValue);
			})
		);
	};

	// Build option "entities" for a selector field
	function getSelectEntities(fd: FieldDef): Array<{ id: string; label: string }> {
		// custom_table_selector: use server-resolved entities
		if (fd.type === 'custom_table_selector' && fd.resolvedEntities) {
			return fd.resolvedEntities;
		}
		const opts = fd.fieldOptions;
		if (!opts) return [];
		// smart_dropdown: collect all options from all conditional mappings
		if (fd.type === 'smart_dropdown' && Array.isArray(opts.mappings)) {
			const seen = new Set<string>();
			const entities: Array<{ id: string; label: string }> = [];
			for (const mapping of opts.mappings) {
				if (Array.isArray(mapping.options)) {
					for (const o of mapping.options) {
						const label = o.label || o.value || o.id;
						if (!seen.has(label)) {
							seen.add(label);
							entities.push({ id: label, label });
						}
					}
				}
			}
			return entities;
		}
		// dropdown/multiple_choice: use inline options from field_options
		if (Array.isArray(opts.options)) {
			return opts.options.map((o: any) => ({
				id: o.value || o.label || o.id,
				label: o.label || o.value || o.id
			}));
		}
		return [];
	}

	// Save a field value with audit trail
	async function saveFieldValue(
		instanceId: string,
		fieldKey: string,
		newValue: any,
		oldValue: any,
		record: FieldValueRecord | undefined,
		stageId: string
	) {
		const stringValue = typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue ?? '');
		const stringOldValue = typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue ?? '');

		const formData = new FormData();
		formData.append('instance_id', instanceId);
		formData.append('field_key', fieldKey);
		formData.append('value', stringValue);
		formData.append('old_value', stringOldValue);
		formData.append('record_id', record?.recordId || '');
		formData.append('stage_id', record?.stageId || stageId || '');

		const response = await fetch('?/updateFieldValue', {
			method: 'POST',
			body: formData
		});

		const result = await response.json();
		if (result.type === 'success') {
			await invalidateAll();
		} else {
			toast.error('Failed to update field value');
			throw new Error(result.data?.message || 'Failed to update');
		}
	}

	function isSelectType(type: string): boolean {
		return ['dropdown', 'multiple_choice', 'smart_dropdown', 'custom_table_selector'].includes(type);
	}

	function isSingleSelectField(fd: FieldDef): boolean {
		if (fd.type === 'dropdown' || fd.type === 'smart_dropdown') return true;
		if (fd.type === 'custom_table_selector') return !fd.fieldOptions?.allow_multiple;
		return false; // multiple_choice
	}

	const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.heic', '.heif'];
	function isImageFile(name: string): boolean {
		return IMAGE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
	}

	function mapFieldType(workflowType: string): 'text' | 'number' | 'date' | 'boolean' {
		switch (workflowType) {
			case 'number': return 'number';
			case 'date': return 'date';
			default: return 'text';
		}
	}

	const columns = $derived.by((): BaseColumnConfig<InstanceRow>[] => {
		const standardColumns: BaseColumnConfig<InstanceRow>[] = [
			{
				id: 'status',
				header: 'Status',
				accessorKey: 'status',
				fieldType: 'text',
				capabilities: { sortable: true, filterable: true, readonly: true },
				cellRenderer: statusCellRenderer
			},
			{
				id: 'current_stage',
				header: 'Stage',
				accessorFn: (row) => row.current_stage_name,
				fieldType: 'text',
				capabilities: { sortable: true, filterable: true, readonly: true }
			},
			{
				id: 'created_by',
				header: 'Created By',
				accessorFn: (row) => row.created_by_name,
				fieldType: 'text',
				capabilities: { sortable: true, filterable: true, readonly: true }
			}
		];

		if (data.workflow.workflow_type === 'incident') {
			standardColumns.push({
				id: 'location',
				header: 'Location',
				accessorFn: (row) => {
					if (!row.location) return '';
					if (typeof row.location === 'object' && row.location.lat != null) {
						return `${Number(row.location.lat).toFixed(4)}, ${Number(row.location.lon).toFixed(4)}`;
					}
					return String(row.location);
				},
				fieldType: 'text',
				capabilities: { sortable: false, filterable: false, readonly: true }
			});
		}

		// Dynamic field columns
		const fieldColumns: BaseColumnConfig<InstanceRow>[] = (data.fieldDefs as FieldDef[]).map((fd) => {
			if (isSelectType(fd.type)) {
				// Use array fieldType with entityConfig -> renders MobileMultiSelect in edit mode, badges in view
				const entities = getSelectEntities(fd);
				return {
					id: fd.id,
					header: fd.label,
					accessorFn: (row: InstanceRow) => {
						const val = row.fieldData[fd.id];
						if (val == null) return [];
						return Array.isArray(val) ? val : [val];
					},
					fieldType: 'array' as const,
					capabilities: { sortable: true, filterable: true, editable: true },
					entityConfig: {
						getEntityId: (e: { id: string }) => e.id,
						getEntityName: (e: { id: string; label: string }) => e.label,
						availableEntities: entities,
						singleSelect: isSingleSelectField(fd)
					},
					onUpdate: async (rowId: string, value: any) => {
						const row = rows.find((r: InstanceRow) => r.id === rowId);
						if (!row) return;
						await saveFieldValue(
							rowId, fd.id, value,
							row.fieldData[fd.id],
							row.fieldValueRecords[fd.id],
							row.current_stage_id
						);
					}
				};
			}

			// File fields: show MediaGallery in view mode
			if (fd.type === 'file') {
				return {
					id: fd.id,
					header: fd.label,
					accessorFn: (row: InstanceRow) => row.fileData[fd.id] || [],
					fieldType: 'text' as const,
					capabilities: { sortable: false, filterable: false, readonly: true },
					cellRenderer: fileCellRenderer
				};
			}

			// Standard editable fields (text, number, date, email, long_text)
			return {
				id: fd.id,
				header: fd.label,
				accessorFn: (row: InstanceRow) => {
					const val = row.fieldData[fd.id];
					if (val == null) return '';
					if (Array.isArray(val)) return val.join(', ');
					return String(val);
				},
				fieldType: mapFieldType(fd.type),
				capabilities: { sortable: true, filterable: true, editable: true },
				onUpdate: async (rowId: string, value: string) => {
					const row = rows.find((r: InstanceRow) => r.id === rowId);
					if (!row) return;
					await saveFieldValue(
						rowId, fd.id, value,
						row.fieldData[fd.id],
						row.fieldValueRecords[fd.id],
						row.current_stage_id
					);
				}
			};
		});

		const metaColumns: BaseColumnConfig<InstanceRow>[] = [
			{
				id: 'created',
				header: 'Created',
				accessorKey: 'created',
				fieldType: 'date',
				capabilities: { sortable: true, filterable: false, readonly: true }
			}
		];

		return [...standardColumns, ...fieldColumns, ...metaColumns];
	});

	async function updateMeta(field: string, value: any) {
		const formData = new FormData();
		formData.append('field', field);
		formData.append('value', typeof value === 'string' ? value : JSON.stringify(value));

		const response = await fetch('?/updateWorkflowMeta', {
			method: 'POST',
			body: formData
		});

		const result = await response.json();
		if (result.type === 'success') {
			await invalidateAll();
		} else {
			toast.error('Failed to update');
		}
	}

	// CSV Import state
	let csvImportOpen = $state(false);

	// Stage selector: stages are sorted by stage_order from the server
	const csvImportStages = $derived(
		data.stages.map((s: any) => ({ id: s.id, label: s.stage_name }))
	);
	const startStageId = $derived(
		data.stages.find((s: any) => s.stage_type === 'start')?.id || data.stages[0]?.id || ''
	);
	let selectedImportStageId = $state('');
	// Reset to start stage when dialog opens/closes
	$effect(() => {
		if (csvImportOpen) {
			selectedImportStageId = startStageId;
		}
	});

	// Filter target fields to only those from stages up to the selected import stage
	const csvImportTargetFields: TargetField[] = $derived.by(() => {
		const fieldStageMap = data.fieldStageMap as Record<string, string>;
		const stageIds = data.stages.map((s: any) => s.id);
		const selectedIndex = stageIds.indexOf(selectedImportStageId);
		const reachableStageIds = new Set(stageIds.slice(0, selectedIndex + 1));

		return (data.fieldDefs as FieldDef[])
			.filter((fd) => {
				const fieldStage = fieldStageMap[fd.id];
				// Include field if its stage is reachable, or if it has no stage mapping
				return !fieldStage || reachableStageIds.has(fieldStage);
			})
			.map((fd) => ({
				id: fd.id,
				label: fd.label,
				type: fd.type,
				required: false
			}));
	});

	const csvImportSpecialColumns: SpecialColumn[] = $derived(
		data.workflow.workflow_type === 'incident'
			? [
					{ key: 'lat', label: 'Latitude', required: true },
					{ key: 'lon', label: 'Longitude', required: true }
				]
			: []
	);

	async function handleCsvImport(importData: MappedImportData, onProgress: ImportProgressCallback): Promise<{ success: boolean; count: number; error?: string }> {
		const { rows, replaceData } = importData;
		const BATCH_SIZE = 25;
		let imported = 0;

		for (let i = 0; i < rows.length; i += BATCH_SIZE) {
			const batch = rows.slice(i, i + BATCH_SIZE);
			const formData = new FormData();
			formData.append('rows', JSON.stringify(batch));
			formData.append('replaceData', i === 0 ? String(replaceData) : 'false');
			formData.append('targetStageId', selectedImportStageId);

			const response = await fetch('?/importCSV', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type !== 'success') {
				return { success: false, count: imported, error: result.data?.message || m.csvImportError() };
			}
			imported += batch.length;
			onProgress(imported, rows.length);
		}

		await invalidateAll();
		return { success: true, count: imported };
	}

	// Icon designer state
	let iconDesignerOpen = $state(false);
	let iconDesignerStages = $state<any[]>([]);
	let iconDesignerWorkflowIconConfig = $state<any>(undefined);
	let iconDesignerFilterMode = $state<'none' | 'stage' | 'field'>('none');
	let iconDesignerFilterFieldOptions = $state<string[]>([]);
	let iconDesignerFilterValueIcons = $state<Record<string, any>>({});

	async function openIconDesigner() {
		try {
			const pb = getPocketBase();
			const [stages, fullWorkflow, fieldTagRecords] = await Promise.all([
				pb.collection('workflow_stages').getFullList({
					filter: `workflow_id = "${$page.params.workflowId}"`,
					sort: 'stage_order'
				}),
				pb.collection('workflows').getOne($page.params.workflowId),
				pb.collection('tools_field_tags').getFullList({
					filter: `workflow_id = "${$page.params.workflowId}"`
				})
			]);
			iconDesignerStages = stages;
			iconDesignerWorkflowIconConfig = (fullWorkflow as any).icon_config?.svgContent
				? (fullWorkflow as any).icon_config
				: undefined;
			iconDesignerFilterValueIcons = (fullWorkflow as any).filter_value_icons || {};

			let filterMode: 'none' | 'stage' | 'field' = 'none';
			let filterFieldOptions: string[] = [];

			for (const ft of fieldTagRecords) {
				const mappings = (ft.tag_mappings || []) as Array<{ tagType: string; fieldId: string | null; config: Record<string, unknown> }>;
				const filterable = mappings.find((m) => m.tagType === 'filterable');
				if (!filterable) continue;

				const filterBy = (filterable.config?.filterBy as string) || 'field';
				if (filterBy === 'stage') {
					filterMode = 'stage';
				} else if (filterBy === 'field' && filterable.fieldId) {
					filterMode = 'field';
					try {
						const formField = await pb.collection('tools_form_fields').getOne(filterable.fieldId);
						const opts = (formField.field_options as any)?.options || [];
						filterFieldOptions = opts.map((o: any) => o.label || o);
					} catch {
						// Field might have been deleted
					}
				}
			}

			iconDesignerFilterMode = filterMode;
			iconDesignerFilterFieldOptions = filterFieldOptions;
			iconDesignerOpen = true;
		} catch (err) {
			console.error('Error loading icon designer data:', err);
			toast.error('Failed to load icon designer data');
		}
	}

	async function handleSaveWorkflowIcon(config: any) {
		const formData = new FormData();
		formData.append('iconConfig', config ? JSON.stringify(config) : '');

		const response = await fetch('?/updateIconConfig', {
			method: 'POST',
			body: formData
		});

		const result = await response.json();
		if (result.type !== 'success') {
			throw new Error('Failed to save');
		}
		await invalidateAll();
	}

	async function handleSaveStageIcon(stageId: string, config: any) {
		const formData = new FormData();
		formData.append('stageId', stageId);
		formData.append('iconConfig', config ? JSON.stringify(config) : '');

		const response = await fetch('?/updateStageIconConfig', {
			method: 'POST',
			body: formData
		});

		const result = await response.json();
		if (result.type !== 'success') {
			throw new Error('Failed to save');
		}
	}

	async function handleSaveFilterValueIcon(value: string, config: any) {
		const updated = { ...iconDesignerFilterValueIcons };
		if (config) {
			updated[value] = config;
		} else {
			delete updated[value];
		}
		iconDesignerFilterValueIcons = updated;

		const formData = new FormData();
		formData.append('filterValueIcons', JSON.stringify(updated));

		const response = await fetch('?/updateFilterValueIcons', {
			method: 'POST',
			body: formData
		});

		const result = await response.json();
		if (result.type !== 'success') {
			throw new Error('Failed to save');
		}
	}

	async function toggleActive() {
		await updateMeta('is_active', !data.workflow.is_active);
	}

	async function togglePrivateInstances() {
		await updateMeta('private_instances', !data.workflow.private_instances);
	}
</script>

{#snippet fileCellRenderer({ value }: { value: any })}
	{@const files = Array.isArray(value) ? value as Array<{ recordId: string; fileName: string }> : []}
	{#if files.length > 0}
		<div class="flex items-center gap-1">
			{#each files as file}
				{@const url = `${POCKETBASE_URL}/api/files/workflow_instance_field_values/${file.recordId}/${file.fileName}`}
				{#if isImageFile(file.fileName)}
					<button
						type="button"
						class="h-8 w-8 rounded border border-border overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-primary transition-shadow"
						onclick={() => { lightboxUrl = url; lightboxOpen = true; }}
					>
						<img src="{url}?thumb=80x80" alt={file.fileName} class="h-full w-full object-cover" />
					</button>
				{:else}
					<a
						href={url}
						target="_blank"
						rel="noopener"
						class="h-8 px-2 rounded border border-border flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors flex-shrink-0"
						title={file.fileName}
					>
						<FileText class="h-3 w-3" />
						<span class="max-w-[60px] truncate">{file.fileName.split('.').pop()}</span>
					</a>
				{/if}
			{/each}
			{#if files.length > 1}
				<span class="text-xs text-muted-foreground">{files.length}</span>
			{/if}
		</div>
	{:else}
		<span class="text-muted-foreground text-xs">-</span>
	{/if}
{/snippet}

{#snippet statusCellRenderer({ value }: { value: any })}
	{@const status = String(value)}
	<Badge variant={status === 'active' ? 'default' : status === 'completed' ? 'secondary' : 'outline'}>
		{status}
	</Badge>
{/snippet}

<div class="flex flex-col gap-4 min-w-0 w-full">
	<DataViewerHeader
		name={data.workflow.name}
		description={data.workflow.description || ''}
		visibleToRoles={data.workflow.visible_to_roles || []}
		roles={data.roles}
		onNameChange={(value) => updateMeta('name', value)}
		onDescriptionChange={(value) => updateMeta('description', value)}
		onRolesChange={(value) => updateMeta('visible_to_roles', value)}
	>
		{#snippet actions()}
			<div class="flex items-center gap-2">
				<Badge variant={data.workflow.workflow_type === 'incident' ? 'default' : 'secondary'}>
					{#if data.workflow.workflow_type === 'incident'}
						<MapPin class="mr-1 h-3 w-3" />
					{/if}
					{data.workflow.workflow_type}
				</Badge>

				<div class="flex items-center gap-2 text-sm">
					<span class="text-muted-foreground">{data.workflow.is_active ? 'Active' : 'Inactive'}</span>
					<Switch
						checked={data.workflow.is_active}
						onCheckedChange={toggleActive}
					/>
				</div>

				<div class="flex items-center gap-2 text-sm" title={m.workflowPrivateInstancesHelp()}>
					<span class="text-muted-foreground">{m.workflowPrivateInstances()}</span>
					<Switch
						checked={data.workflow.private_instances}
						onCheckedChange={togglePrivateInstances}
					/>
				</div>

				<Button variant="outline" size="sm" onclick={() => (csvImportOpen = true)}>
					<Upload class="mr-2 h-4 w-4" />
					{m.csvImportButton()}
				</Button>

				<Button variant="outline" size="sm" onclick={() => openIconDesigner()}>
					<Palette class="mr-2 h-4 w-4" />
					Icons
				</Button>

				<Button
					variant="outline"
					size="sm"
					href="/projects/{$page.params.projectId}/workflows/{$page.params.workflowId}/builder"
				>
					<Hammer class="mr-2 h-4 w-4" />
					Build
				</Button>

				<Button variant="outline" size="sm" onclick={() => invalidateAll()}>
					<RefreshCw class="mr-2 h-4 w-4" />
					{m.customTableEditRefresh()}
				</Button>
			</div>
		{/snippet}
	</DataViewerHeader>

	<BaseTable
		bind:this={tableRef}
		data={rows}
		{columns}
		{globalFilterFn}
		enableRowSelection={true}
		enableShiftSelect={true}
		showToolbar={true}
		showEditMode={true}
		editModeLabel="Edit mode"
		emptyMessage="No workflow instances yet"
		emptySubMessage="Instances are created by participants through the app"
	/>
</div>

<!-- Workflow Icon Designer Modal -->
{#if iconDesignerOpen}
	<div class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onclick={() => {
		iconDesignerOpen = false;
	}}></div>
	<div class="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]">
		<WorkflowIconDesigner
			workflowName={data.workflow.name}
			initialIconConfig={iconDesignerWorkflowIconConfig}
			stages={iconDesignerStages}
			filterMode={iconDesignerFilterMode}
			filterFieldOptions={iconDesignerFilterFieldOptions}
			filterValueIcons={iconDesignerFilterValueIcons}
			onSaveWorkflowIcon={handleSaveWorkflowIcon}
			onSaveStageIcon={handleSaveStageIcon}
			onSaveFilterValueIcon={handleSaveFilterValueIcon}
			onCancel={() => {
				iconDesignerOpen = false;
			}}
		/>
	</div>
{/if}

<!-- CSV Import Dialog -->
<CsvImportDialog
	bind:open={csvImportOpen}
	targetFields={csvImportTargetFields}
	specialColumns={csvImportSpecialColumns}
	stages={csvImportStages}
	bind:selectedStage={selectedImportStageId}
	title={m.csvImportInstancesTitle()}
	description={m.csvImportInstancesDescription()}
	importLabel={m.csvImportImportInstances()}
	replaceLabel={m.csvImportReplaceInstances()}
	onimport={handleCsvImport}
/>

<!-- Image Lightbox -->
<Dialog.Root bind:open={lightboxOpen}>
	<Dialog.Content class="max-w-3xl p-0 overflow-hidden">
		{#if lightboxUrl}
			<img src={lightboxUrl} alt="Preview" class="w-full h-auto" />
		{/if}
	</Dialog.Content>
</Dialog.Root>
