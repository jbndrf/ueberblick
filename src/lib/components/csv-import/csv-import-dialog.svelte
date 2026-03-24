<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Progress } from '$lib/components/ui/progress';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';
	import { parseCSV } from './parse-csv';

	export type TargetField = {
		id: string;
		label: string;
		type: string;
		required: boolean;
	};

	export type SpecialColumn = {
		key: string;
		label: string;
		required: boolean;
	};

	export type MappedImportData = {
		rows: Array<Record<string, string>>;
		replaceData: boolean;
	};

	export type ImportProgressCallback = (current: number, total: number) => void;

	type StageOption = {
		id: string;
		label: string;
	};

	type Props = {
		open: boolean;
		targetFields: TargetField[];
		specialColumns?: SpecialColumn[];
		stages?: StageOption[];
		selectedStage?: string;
		replaceOption?: boolean;
		title?: string;
		description?: string;
		replaceLabel?: string;
		importLabel?: string;
		onimport: (data: MappedImportData, onProgress: ImportProgressCallback) => Promise<{ success: boolean; count: number; error?: string }>;
	};

	let {
		open = $bindable(false),
		targetFields,
		specialColumns = [],
		stages = [],
		selectedStage = $bindable(''),
		replaceOption = true,
		title = m.csvImportDialogTitle(),
		description = m.csvImportDialogDescription(),
		replaceLabel = m.csvImportReplaceData(),
		importLabel = m.csvImportImportData(),
		onimport
	}: Props = $props();

	// State
	let step = $state<'upload' | 'map' | 'confirm'>('upload');
	let csvFile = $state<File | null>(null);
	let csvHeaders = $state<string[]>([]);
	let csvRows = $state<string[][]>([]);
	let replaceData = $state(false);
	let importing = $state(false);
	let importProgress = $state(0);
	let importTotal = $state(0);

	// Column mapping: csvHeader -> targetField.id or specialColumn.key
	let columnMapping = $state<Record<string, string>>({});

	// All mappable targets: special columns first, then target fields
	const allTargets = $derived([
		...specialColumns.map((sc) => ({ id: sc.key, label: sc.label, required: sc.required })),
		...targetFields.map((tf) => ({ id: tf.id, label: tf.label, required: tf.required }))
	]);

	// Clear stale mappings when targetFields changes (e.g. stage selector changed)
	$effect(() => {
		const validIds = new Set(allTargets.map((t) => t.id));
		let changed = false;
		const cleaned = { ...columnMapping };
		for (const [header, targetId] of Object.entries(cleaned)) {
			if (targetId && !validIds.has(targetId)) {
				cleaned[header] = '';
				changed = true;
			}
		}
		if (changed) {
			columnMapping = cleaned;
		}
	});

	// Check which required targets are mapped
	const requiredTargets = $derived(allTargets.filter((t) => t.required));
	const mappedTargetIds = $derived(new Set(Object.values(columnMapping).filter(Boolean)));
	const allRequiredMapped = $derived(requiredTargets.every((t) => mappedTargetIds.has(t.id)));

	// Targets already used (to prevent duplicate mapping)
	function availableTargetsFor(csvHeader: string): typeof allTargets {
		const currentMapping = columnMapping[csvHeader];
		return allTargets.filter((t) => !mappedTargetIds.has(t.id) || t.id === currentMapping);
	}

	// --- Validation ---
	const isLatKey = (key: string) => /^lat(itude)?$/i.test(key);
	const isLonKey = (key: string) => /^lon(gitude)?$/i.test(key);
	const specialColumnKeys = $derived(new Set(specialColumns.map((sc) => sc.key)));

	type ColumnValidation = {
		csvHeader: string;
		targetId: string;
		errors: number;
		errorType: 'lat' | 'lon' | 'required';
	};

	const validationResults = $derived.by(() => {
		const results: ColumnValidation[] = [];

		for (const [csvHeader, targetId] of Object.entries(columnMapping)) {
			if (!targetId) continue;

			const colIndex = csvHeaders.indexOf(csvHeader);
			if (colIndex === -1) continue;

			const values = csvRows.map((row) => row[colIndex] ?? '');

			// Latitude validation
			if (isLatKey(targetId) && specialColumnKeys.has(targetId)) {
				const badCount = values.filter((v) => {
					const n = Number(v);
					return v.trim() === '' || isNaN(n) || n < -90 || n > 90;
				}).length;
				if (badCount > 0) {
					results.push({ csvHeader, targetId, errors: badCount, errorType: 'lat' });
				}
			}

			// Longitude validation
			if (isLonKey(targetId) && specialColumnKeys.has(targetId)) {
				const badCount = values.filter((v) => {
					const n = Number(v);
					return v.trim() === '' || isNaN(n) || n < -180 || n > 180;
				}).length;
				if (badCount > 0) {
					results.push({ csvHeader, targetId, errors: badCount, errorType: 'lon' });
				}
			}

			// Required field validation
			const target = allTargets.find((t) => t.id === targetId);
			if (target?.required && !isLatKey(targetId) && !isLonKey(targetId)) {
				const emptyCount = values.filter((v) => v.trim() === '').length;
				if (emptyCount > 0) {
					results.push({ csvHeader, targetId, errors: emptyCount, errorType: 'required' });
				}
			}
		}

		return results;
	});

	const hasBlockingErrors = $derived(
		validationResults.some((v) => v.errorType === 'lat' || v.errorType === 'lon')
	);
	const hasValidationWarnings = $derived(
		validationResults.some((v) => v.errorType === 'required')
	);

	function getValidationForHeader(header: string): ColumnValidation | undefined {
		return validationResults.find((v) => v.csvHeader === header);
	}

	function getValidationMessage(v: ColumnValidation): string {
		switch (v.errorType) {
			case 'lat': return m.csvImportLatitudeError({ count: v.errors });
			case 'lon': return m.csvImportLongitudeError({ count: v.errors });
			case 'required': return m.csvImportRequiredEmptyError({ count: v.errors });
		}
	}

	// Preview: first 3 rows mapped
	const previewRows = $derived.by(() => {
		if (csvRows.length === 0) return [];
		const rows = csvRows.slice(0, 3);
		return rows.map((row) => {
			const mapped: Record<string, string> = {};
			csvHeaders.forEach((header, i) => {
				const target = columnMapping[header];
				if (target) {
					mapped[target] = row[i] ?? '';
				}
			});
			return mapped;
		});
	});

	// Mapped target labels for preview table headers
	const mappedTargets = $derived(
		allTargets.filter((t) => mappedTargetIds.has(t.id))
	);

	async function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0] || null;
		csvFile = file;

		if (!file) return;

		const text = await file.text();
		const { headers, rows } = parseCSV(text);

		if (headers.length === 0) {
			toast.error(m.csvImportError());
			csvFile = null;
			return;
		}

		csvHeaders = headers;
		csvRows = rows;

		// Auto-map: try to match CSV headers to target labels (case-insensitive)
		const autoMapping: Record<string, string> = {};
		for (const header of headers) {
			const headerLower = header.toLowerCase().trim();
			for (const target of allTargets) {
				const targetLower = target.label.toLowerCase().trim();
				if (headerLower === targetLower && !Object.values(autoMapping).includes(target.id)) {
					autoMapping[header] = target.id;
					break;
				}
			}
		}
		columnMapping = autoMapping;

		step = 'map';
	}

	function handleMappingChange(csvHeader: string, targetId: string) {
		columnMapping = { ...columnMapping, [csvHeader]: targetId };
	}

	async function handleImport() {
		if (!allRequiredMapped || hasBlockingErrors) return;

		importing = true;
		importProgress = 0;
		importTotal = csvRows.length;
		try {
			// Map all rows according to column mapping
			const mappedRows = csvRows.map((row) => {
				const mapped: Record<string, string> = {};
				csvHeaders.forEach((header, i) => {
					const target = columnMapping[header];
					if (target) {
						mapped[target] = row[i] ?? '';
					}
				});
				return mapped;
			});

			const result = await onimport({ rows: mappedRows, replaceData }, (current, total) => {
				importProgress = current;
				importTotal = total;
			});

			if (result.success) {
				toast.success(`${m.csvImportSuccess()} (${result.count})`);
				resetAndClose();
			} else {
				toast.error(result.error || m.csvImportError());
			}
		} catch (err) {
			console.error('CSV import error:', err);
			toast.error(m.csvImportError());
		} finally {
			importing = false;
		}
	}

	function resetAndClose() {
		step = 'upload';
		csvFile = null;
		csvHeaders = [];
		csvRows = [];
		columnMapping = {};
		replaceData = false;
		importing = false;
		importProgress = 0;
		importTotal = 0;
		open = false;
	}

	function goBack() {
		if (step === 'map') {
			step = 'upload';
			csvFile = null;
			csvHeaders = [];
			csvRows = [];
			columnMapping = {};
		} else if (step === 'confirm') {
			step = 'map';
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={(isOpen) => { if (!isOpen) resetAndClose(); }}>
	<Dialog.Content class="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
		</Dialog.Header>

		{#if step === 'upload'}
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="csv-file">{m.csvImportFileLabel()}</Label>
					<Input
						id="csv-file"
						type="file"
						accept=".csv"
						onchange={handleFileSelect}
					/>
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={resetAndClose}>
					{m.csvImportCancel()}
				</Button>
			</Dialog.Footer>

		{:else if step === 'map'}
			<div class="space-y-4 py-4">
				<p class="text-sm text-muted-foreground">
					{csvRows.length} {m.csvImportRowsFound()} -- {csvHeaders.length} {m.csvImportColumnsFound()}
				</p>

				{#if stages.length > 0}
					<div class="space-y-2">
						<Label for="import-stage">{m.csvImportTargetStage()}</Label>
						<select
							id="import-stage"
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							value={selectedStage}
							onchange={(e) => { selectedStage = (e.target as HTMLSelectElement).value; }}
						>
							{#each stages as stage}
								<option value={stage.id}>{stage.label}</option>
							{/each}
						</select>
						<p class="text-xs text-muted-foreground">{m.csvImportTargetStageHint()}</p>
					</div>
				{/if}

				<!-- Column mapping table -->
				<div class="border rounded-md overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b bg-muted/50">
								<th class="text-left p-2 font-medium whitespace-nowrap">{m.csvImportCsvColumn()}</th>
								<th class="text-left p-2 font-medium whitespace-nowrap">{m.csvImportMapsTo()}</th>
								<th class="text-left p-2 font-medium whitespace-nowrap">{m.csvImportPreview()}</th>
								<th class="text-left p-2 font-medium whitespace-nowrap">{m.csvImportValidation()}</th>
							</tr>
						</thead>
						<tbody>
							{#each csvHeaders as header, i}
								{@const validation = getValidationForHeader(header)}
								<tr class="border-b last:border-0">
									<td class="p-2 font-mono text-xs whitespace-nowrap">{header}</td>
									<td class="p-2">
										<select
											class="w-full min-w-[140px] rounded-md border border-input bg-background px-3 py-1.5 text-sm"
											value={columnMapping[header] || ''}
											onchange={(e) => handleMappingChange(header, (e.target as HTMLSelectElement).value)}
										>
											<option value="">-- {m.csvImportSkipColumn()} --</option>
											{#each availableTargetsFor(header) as target}
												<option value={target.id}>
													{target.label}{target.required ? ' *' : ''}
												</option>
											{/each}
										</select>
									</td>
									<td class="p-2 text-xs text-muted-foreground max-w-[150px] truncate">
										{csvRows[0]?.[i] ?? ''}
									</td>
									<td class="p-2 text-xs">
										{#if validation}
											<span class={validation.errorType === 'required' ? 'text-amber-600' : 'text-destructive'}>
												{getValidationMessage(validation)}
											</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				{#if hasBlockingErrors}
					<p class="text-sm text-destructive">
						{m.csvImportValidationBlockingErrors()}
					</p>
				{:else if hasValidationWarnings}
					<p class="text-sm text-amber-600">
						{m.csvImportValidationWarnings()}
					</p>
				{/if}

				{#if !allRequiredMapped}
					<p class="text-sm text-destructive">
						{m.csvImportRequiredFieldsMissing()}
					</p>
				{/if}
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={goBack}>
					{m.csvImportBack()}
				</Button>
				<Button onclick={() => { step = 'confirm'; }} disabled={!allRequiredMapped || hasBlockingErrors}>
					{m.csvImportContinue()}
				</Button>
			</Dialog.Footer>

		{:else if step === 'confirm'}
			<div class="space-y-4 py-4">
				{#if importing}
					<div class="space-y-3">
						<Progress value={importProgress} max={importTotal} />
						<p class="text-sm text-muted-foreground text-center">
							{m.csvImportProgressText({ current: importProgress, total: importTotal })}
						</p>
					</div>
				{:else}
					<p class="text-sm">
						{m.csvImportReadyToImport({ count: csvRows.length, fields: mappedTargets.length })}
					</p>

					<!-- Preview table -->
					{#if previewRows.length > 0}
						<div class="border rounded-md overflow-x-auto">
							<table class="text-xs">
								<thead>
									<tr class="border-b bg-muted/50">
										{#each mappedTargets as target}
											<th class="text-left p-2 font-medium whitespace-nowrap">{target.label}</th>
										{/each}
									</tr>
								</thead>
								<tbody>
									{#each previewRows as row}
										<tr class="border-b last:border-0">
											{#each mappedTargets as target}
												<td class="p-2 whitespace-nowrap max-w-[150px] truncate">{row[target.id] ?? ''}</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						{#if csvRows.length > 3}
							<p class="text-xs text-muted-foreground">
								... {m.csvImportAndMoreRows({ count: csvRows.length - 3 })}
							</p>
						{/if}
					{/if}

					{#if replaceOption}
						<div class="flex items-center space-x-2">
							<Checkbox
								id="replace-data"
								checked={replaceData}
								onCheckedChange={(checked) => (replaceData = checked === true)}
							/>
							<Label for="replace-data" class="text-sm font-normal cursor-pointer">
								{replaceLabel}
							</Label>
						</div>
					{/if}
				{/if}
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={goBack} disabled={importing}>
					{m.csvImportBack()}
				</Button>
				<Button onclick={handleImport} disabled={importing}>
					{importing ? m.csvImportImporting() : importLabel}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
