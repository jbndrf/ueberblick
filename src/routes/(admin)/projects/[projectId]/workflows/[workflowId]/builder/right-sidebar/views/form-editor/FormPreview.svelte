<script lang="ts">
	import { flip } from 'svelte/animate';
	import { tick } from 'svelte';
	import { Plus, X, Pencil, Check, AlignLeft, AlignRight, Maximize2 } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import FieldCard from './FieldCard.svelte';
	import type { TrackedFormField, FieldType, ToolsFormField, ColumnPosition } from '$lib/workflow-builder';

	// Drop zone configuration type
	type DropZoneConfig = {
		mode: 'new-field' | 'reorder';
		rowIndex: number;
		type: 'new-row' | 'between-row';
		small?: boolean;
	};

	type Props = {
		fields: TrackedFormField[];
		selectedFieldId?: string | null;
		onFieldSelect?: (fieldId: string) => void;
		onFieldsReorder?: (fieldIds: string[]) => void;
		onFieldDrop?: (fieldType: FieldType, page: number, rowIndex: number, columnPosition: ColumnPosition) => void;
		onFieldUpdate?: (fieldId: string, updates: Partial<ToolsFormField>) => void;
		onPageTitleChange?: (page: number, title: string) => void;
		onAddPage?: () => void;
		onDeletePage?: (page: number) => void;
	};

	let {
		fields,
		selectedFieldId = null,
		onFieldSelect,
		onFieldsReorder,
		onFieldDrop,
		onFieldUpdate,
		onPageTitleChange,
		onAddPage,
		onDeletePage
	}: Props = $props();

	// Current page being viewed
	let currentPage = $state(1);

	// Editing page title
	let editingPageTitle = $state<number | null>(null);
	let editingTitleValue = $state('');

	// Get unique pages from fields, default to page 1
	const pages = $derived.by(() => {
		const pageSet = new Set<number>();
		for (const field of fields) {
			pageSet.add(field.data.page ?? 1);
		}
		if (pageSet.size === 0) pageSet.add(1);
		return Array.from(pageSet).sort((a, b) => a - b);
	});

	// Get page titles from the first field on each page
	const pageTitles = $derived.by(() => {
		const titles: Record<number, string> = {};
		for (const page of pages) {
			const firstField = fields.find((f) => (f.data.page ?? 1) === page);
			titles[page] = firstField?.data.page_title || (m.formEditorPreviewPageFallback?.({ page }) ?? `Page ${page}`);
		}
		return titles;
	});

	// Sort and filter fields for current page
	const currentPageFields = $derived(
		[...fields]
			.filter((f) => (f.data.page ?? 1) === currentPage)
			.sort((a, b) => (a.data.field_order ?? 0) - (b.data.field_order ?? 0))
	);

	// Group fields into rows based on explicit row_index
	type FieldRow = { fields: TrackedFormField[]; isHalfWidth: boolean; rowIndex: number };
	const fieldRows = $derived.by((): FieldRow[] => {
		const rowMap = new Map<number, TrackedFormField[]>();

		// Group fields by row_index
		for (const field of currentPageFields) {
			const rowIdx = field.data.row_index ?? 0;
			if (!rowMap.has(rowIdx)) rowMap.set(rowIdx, []);
			rowMap.get(rowIdx)!.push(field);
		}

		// Sort rows by index, sort fields within row (left before right)
		const positionOrder: Record<ColumnPosition, number> = { left: 0, right: 1, full: 0 };
		return Array.from(rowMap.entries())
			.sort(([a], [b]) => a - b)
			.map(([rowIdx, rowFields]) => ({
				fields: rowFields.sort((a, b) =>
					positionOrder[a.data.column_position] - positionOrder[b.data.column_position]
				),
				isHalfWidth: rowFields[0]?.data.column_position !== 'full',
				rowIndex: rowIdx
			}));
	});

	// Get the next available row index for new fields
	const nextRowIndex = $derived(
		fieldRows.length > 0 ? Math.max(...fieldRows.map(r => r.rowIndex)) + 1 : 0
	);

	/**
	 * Recalculate field_order based on visual position after reordering.
	 * Waits for state to update, then calls onFieldsReorder with the new order.
	 * This ensures smart dropdowns can see fields that are now visually before them.
	 */
	async function recalculateFieldOrder() {
		// Wait for the state to update after onFieldUpdate calls
		await tick();

		// Sort fields on current page by visual position: row_index, then column_position (left before right)
		const positionOrder: Record<ColumnPosition, number> = { left: 0, right: 1, full: 0 };
		const sortedFields = [...fields]
			.filter((f) => (f.data.page ?? 1) === currentPage)
			.sort((a, b) => {
				const rowDiff = (a.data.row_index ?? 0) - (b.data.row_index ?? 0);
				if (rowDiff !== 0) return rowDiff;
				return positionOrder[a.data.column_position] - positionOrder[b.data.column_position];
			});

		// Call onFieldsReorder with the new order
		onFieldsReorder?.(sortedFields.map((f) => f.data.id));
	}

	// Drop zone state - with live preview support
	let isDraggingFieldType = $state(false);
	let hoverTarget = $state<{
		type: 'new-row' | 'between-row' | 'existing-row' | 'empty-side';
		position: 'left' | 'middle' | 'right';
		rowIndex: number;
		squeezeFieldId?: string; // Field to squeeze when previewing beside full-width
	} | null>(null);

	function handleFormDragOver(e: DragEvent) {
		e.preventDefault();
		const types = e.dataTransfer?.types;

		// Check if dragging a field type from palette (new field)
		const hasFieldType = types && (Array.from(types).includes('fieldtype') || Array.from(types).includes('fieldType'));
		if (hasFieldType) {
			isDraggingFieldType = true;
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'copy';
			}
			return;
		}

		// Check if reordering existing field
		const hasFieldId = types && Array.from(types).includes('fieldid');
		if (hasFieldId && e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
	}

	function handleFormDragLeave(e: DragEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		if (
			e.clientX < rect.left ||
			e.clientX > rect.right ||
			e.clientY < rect.top ||
			e.clientY > rect.bottom
		) {
			resetDragState();
			// Also clear reorder target when leaving form
			reorderTarget = null;
		}
	}

	function resetDragState() {
		isDraggingFieldType = false;
		hoverTarget = null;
	}

	function handleCellDragOver(
		e: DragEvent,
		type: 'new-row' | 'between-row' | 'existing-row' | 'empty-side',
		position: 'left' | 'middle' | 'right',
		rowIndex: number,
		squeezeFieldId?: string
	) {
		e.preventDefault();
		e.stopPropagation();
		hoverTarget = { type, position, rowIndex, squeezeFieldId };
	}

	// Hover detection for existing rows (to squeeze full-width fields)
	function handleRowDragOver(e: DragEvent, row: FieldRow) {
		if (!isDraggingFieldType) return;
		e.preventDefault();

		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const relativeX = e.clientX - rect.left;
		const width = rect.width;

		// Only allow squeeze for single full-width fields
		if (row.fields.length === 1 && !row.isHalfWidth) {
			const position = relativeX < width / 2 ? 'left' : 'right';
			hoverTarget = {
				type: 'existing-row',
				position,
				rowIndex: row.rowIndex,
				squeezeFieldId: row.fields[0].data.id
			};
		}
	}

	function handleCellDragLeave() {
		// Don't clear immediately - let the parent handle it
	}

	function handleCellDrop(
		e: DragEvent,
		type: 'new-row' | 'between-row' | 'existing-row' | 'empty-side',
		position: 'left' | 'middle' | 'right',
		rowIndex: number,
		squeezeFieldId?: string
	) {
		e.preventDefault();
		e.stopPropagation();

		const fieldType = (e.dataTransfer?.getData('fieldType') || e.dataTransfer?.getData('fieldtype')) as FieldType;
		if (!fieldType) return;

		// Convert position to column_position
		const columnPosition: ColumnPosition = position === 'middle' ? 'full' : position;

		if (type === 'existing-row' && squeezeFieldId) {
			// Dropping beside a full-width field - update it to half-width first
			const existingPosition: ColumnPosition = position === 'left' ? 'right' : 'left';
			onFieldUpdate?.(squeezeFieldId, { column_position: existingPosition });
			// Add new field in the same row (use integer rowIndex)
			onFieldDrop?.(fieldType, currentPage, Math.floor(rowIndex), columnPosition);
		} else if (type === 'empty-side') {
			// Filling empty side of existing row
			onFieldDrop?.(fieldType, currentPage, rowIndex, columnPosition);
		} else if (type === 'between-row') {
			// Between-row insertion - shift all fields at and after the ceiling rowIndex
			const insertAtIndex = Math.ceil(rowIndex);
			// Shift all fields that have row_index >= insertAtIndex
			for (const field of fields) {
				if ((field.data.page ?? 1) === currentPage && field.data.row_index >= insertAtIndex) {
					onFieldUpdate?.(field.data.id, { row_index: field.data.row_index + 1 });
				}
			}
			// Add new field at the insertion point
			onFieldDrop?.(fieldType, currentPage, insertAtIndex, columnPosition);
		} else {
			// New row at the end
			onFieldDrop?.(fieldType, currentPage, rowIndex, columnPosition);
		}

		resetDragState();
	}

	function handleFormDrop(e: DragEvent) {
		e.preventDefault();
		// If dropped on the form but not on a specific zone, add as full width at the end
		const fieldType = (e.dataTransfer?.getData('fieldType') || e.dataTransfer?.getData('fieldtype')) as FieldType;
		if (fieldType && !hoverTarget) {
			onFieldDrop?.(fieldType, currentPage, nextRowIndex, 'full');
		}

		// Reset all drag states
		resetDragState();
		draggedFieldId = null;
		reorderTarget = null;
	}

	// =============================================================================
	// Field Reordering (drag existing fields to new positions)
	// =============================================================================

	let draggedFieldId = $state<string | null>(null);
	let reorderTarget = $state<{
		rowIndex: number;
		position: ColumnPosition;
		squeezeFieldId?: string;
	} | null>(null);

	function handleFieldDragStart(fieldId: string) {
		draggedFieldId = fieldId;
	}

	function handleFieldDragEnd() {
		draggedFieldId = null;
		reorderTarget = null;
	}

	function handleReorderDragOver(e: DragEvent, rowIndex: number, position: ColumnPosition, squeezeFieldId?: string) {
		e.preventDefault();
		e.stopPropagation();
		if (!draggedFieldId) return;
		reorderTarget = { rowIndex, position, squeezeFieldId };
	}

	// Handle drag over a row for reordering (to squeeze full-width fields)
	function handleReorderRowDragOver(e: DragEvent, row: FieldRow) {
		if (!draggedFieldId) return;
		e.preventDefault();

		// Only squeeze if the row has a single full-width field that's not the dragged one
		if (row.fields.length === 1 && row.fields[0].data.column_position === 'full' && row.fields[0].data.id !== draggedFieldId) {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			const relativeX = e.clientX - rect.left;
			const position = relativeX < rect.width / 2 ? 'left' : 'right';
			reorderTarget = {
				rowIndex: row.rowIndex,
				position: position as ColumnPosition,
				squeezeFieldId: row.fields[0].data.id
			};
		}
	}

	function handleReorderDrop(e: DragEvent, rowIndex: number, position: ColumnPosition, squeezeFieldId?: string) {
		if (!draggedFieldId) return;
		e.preventDefault();
		e.stopPropagation();

		// Check if this is a between-row insertion (fractional rowIndex like 0.5)
		const isBetweenRow = rowIndex % 1 !== 0;

		if (squeezeFieldId) {
			// Squeezing a full-width field - update both fields
			const oppositePosition = position === 'left' ? 'right' : 'left';
			onFieldUpdate?.(squeezeFieldId, { column_position: oppositePosition as ColumnPosition });
			onFieldUpdate?.(draggedFieldId, {
				row_index: rowIndex,
				column_position: position
			});
		} else if (isBetweenRow) {
			// Between-row insertion - shift all fields at and after the target
			const insertAtIndex = Math.ceil(rowIndex);
			for (const field of fields) {
				if (
					(field.data.page ?? 1) === currentPage &&
					field.data.row_index >= insertAtIndex &&
					field.data.id !== draggedFieldId
				) {
					onFieldUpdate?.(field.data.id, { row_index: field.data.row_index + 1 });
				}
			}
			onFieldUpdate?.(draggedFieldId, {
				row_index: insertAtIndex,
				column_position: position
			});
		} else {
			// Direct row placement
			onFieldUpdate?.(draggedFieldId, {
				row_index: rowIndex,
				column_position: position
			});
		}

		// Reset state after move
		draggedFieldId = null;
		reorderTarget = null;

		// Recalculate field_order to match new visual positions
		recalculateFieldOrder();
	}

	function handleAddPage() {
		const nextPage = Math.max(...pages) + 1;
		onAddPage?.();
		currentPage = nextPage;
	}

	function startEditingTitle(page: number) {
		editingPageTitle = page;
		editingTitleValue = pageTitles[page] || (m.formEditorPreviewPageFallback?.({ page }) ?? `Page ${page}`);
	}

	function savePageTitle() {
		if (editingPageTitle !== null && editingTitleValue.trim()) {
			onPageTitleChange?.(editingPageTitle, editingTitleValue.trim());
		}
		editingPageTitle = null;
	}

	function handleDeletePage(page: number) {
		if (pages.length <= 1) return;
		onDeletePage?.(page);
		if (currentPage === page) {
			currentPage = pages.find((p) => p !== page) || 1;
		}
	}

	// =============================================================================
	// Unified Drop Zone Helpers
	// =============================================================================

	type CellPosition = 'left' | 'middle' | 'right';
	const CELL_ICONS = { left: AlignLeft, middle: Maximize2, right: AlignRight } as const;

	function isNewFieldCellActive(rowIndex: number, type: 'new-row' | 'between-row', pos: CellPosition): boolean {
		if (!hoverTarget) return false;
		return hoverTarget.type === type && hoverTarget.rowIndex === rowIndex && hoverTarget.position === pos;
	}

	function isReorderCellActive(rowIndex: number, pos: ColumnPosition): boolean {
		if (!reorderTarget) return false;
		return reorderTarget.rowIndex === rowIndex && reorderTarget.position === pos;
	}

	function getColPosFromCell(pos: CellPosition): ColumnPosition {
		return pos === 'middle' ? 'full' : pos;
	}
</script>

{#snippet dropZoneCell(mode: 'new-field' | 'reorder', rowIndex: number, type: 'new-row' | 'between-row', pos: CellPosition, small: boolean = false)}
	{@const isActive = mode === 'new-field' ? isNewFieldCellActive(rowIndex, type, pos) : isReorderCellActive(rowIndex, getColPosFromCell(pos))}
	{@const Icon = CELL_ICONS[pos]}
	{@const previewText = mode === 'new-field' ? (m.formEditorPreviewNewField?.() ?? 'New field') : (m.formEditorPreviewMoveHere?.() ?? 'Move here')}
	<div
		class="drop-zone-cell"
		class:active={isActive}
		ondragover={(e) => {
			e.preventDefault();
			e.stopPropagation();
			if (mode === 'new-field') {
				hoverTarget = { type, position: pos, rowIndex };
			} else {
				reorderTarget = { rowIndex, position: getColPosFromCell(pos) };
			}
		}}
		ondrop={(e) => {
			if (mode === 'new-field') {
				handleCellDrop(e, type, pos, rowIndex);
			} else {
				handleReorderDrop(e, rowIndex, getColPosFromCell(pos));
			}
		}}
		role="button"
		tabindex="-1"
	>
		{#if isActive}
			<div class="preview-placeholder" class:small class:full-width={pos === 'middle'}>{previewText}</div>
		{:else}
			<Icon class="zone-icon" />
		{/if}
	</div>
{/snippet}

{#snippet dropZoneRow(config: DropZoneConfig)}
	{@const { mode, rowIndex, type, small = false } = config}
	{@const isExpanded = mode === 'new-field'
		? (hoverTarget?.type === type && hoverTarget?.rowIndex === rowIndex)
		: (reorderTarget?.rowIndex === rowIndex)}
	{@const isVisible = mode === 'new-field' ? isDraggingFieldType : !!draggedFieldId}
	<div
		class="row-insert-indicator"
		class:reorder-zone={mode === 'reorder'}
		class:hidden={!isVisible}
		class:expanded={isExpanded}
		class:small
	>
		{@render dropZoneCell(mode, rowIndex, type, 'left', small)}
		{@render dropZoneCell(mode, rowIndex, type, 'middle', small)}
		{@render dropZoneCell(mode, rowIndex, type, 'right', small)}
	</div>
{/snippet}

{#snippet emptySideZone(mode: 'new-field' | 'reorder', rowIndex: number, side: 'left' | 'right')}
	{@const isActive = mode === 'new-field'
		? (hoverTarget?.type === 'empty-side' && hoverTarget?.rowIndex === rowIndex && hoverTarget?.position === side)
		: (reorderTarget?.rowIndex === rowIndex && reorderTarget?.position === side)}
	{@const Icon = side === 'left' ? AlignLeft : AlignRight}
	{@const previewText = mode === 'new-field' ? (m.formEditorPreviewNewField?.() ?? 'New field') : (m.formEditorPreviewMoveHere?.() ?? 'Move here')}
	<div
		class="empty-side-indicator"
		class:reorder-zone={mode === 'reorder'}
		class:active={isActive}
		ondragover={(e) => {
			e.preventDefault();
			e.stopPropagation();
			if (mode === 'new-field') {
				hoverTarget = { type: 'empty-side', position: side, rowIndex };
			} else {
				reorderTarget = { rowIndex, position: side };
			}
		}}
		ondragleave={() => {}}
		ondrop={(e) => {
			if (mode === 'new-field') {
				handleCellDrop(e, 'empty-side', side, rowIndex);
			} else {
				handleReorderDrop(e, rowIndex, side);
			}
		}}
		role="button"
		tabindex="-1"
	>
		{#if isActive}
			<div class="preview-placeholder">{previewText}</div>
		{:else}
			<Icon class="zone-icon" />
		{/if}
	</div>
{/snippet}

<div
	class="form-preview"
	class:drag-over={isDraggingFieldType}
	ondragover={handleFormDragOver}
	ondragleave={handleFormDragLeave}
	ondrop={handleFormDrop}
	role="region"
	aria-label={m.formEditorPreviewAriaLabel?.() ?? 'Form preview'}
>
	<!-- Page Tabs -->
	{#if pages.length > 1 || fields.length > 0}
		<div class="page-tabs">
			<div class="tabs-container">
				{#each pages as page (page)}
					<button
						class="page-tab"
						class:active={currentPage === page}
						onclick={() => (currentPage = page)}
						type="button"
					>
						{#if editingPageTitle === page}
							<Input
								bind:value={editingTitleValue}
								class="page-title-input"
								onblur={savePageTitle}
								onkeydown={(e) => e.key === 'Enter' && savePageTitle()}
								autofocus
							/>
							<button class="save-title" onclick={savePageTitle} type="button">
								<Check class="h-3 w-3" />
							</button>
						{:else}
							<span class="tab-title">{pageTitles[page]}</span>
							{#if currentPage === page}
								<button
									class="edit-title"
									onclick={(e) => { e.stopPropagation(); startEditingTitle(page); }}
									type="button"
								>
									<Pencil class="h-3 w-3" />
								</button>
								{#if pages.length > 1}
									<button
										class="delete-page"
										onclick={(e) => { e.stopPropagation(); handleDeletePage(page); }}
										type="button"
									>
										<X class="h-3 w-3" />
									</button>
								{/if}
							{/if}
						{/if}
					</button>
				{/each}
			</div>
			<Button variant="ghost" size="sm" onclick={handleAddPage} class="add-page-btn">
				<Plus class="h-4 w-4" />
			</Button>
		</div>
	{/if}

	<div class="form-preview-inner">
		{#if currentPageFields.length === 0 && !isDraggingFieldType}
			<!-- Empty state - only show when not dragging -->
			<div class="empty-state">
				<div class="empty-icon">
					<Plus class="h-8 w-8" />
				</div>
				<p class="empty-title">{m.formEditorPreviewNoFieldsYet?.() ?? 'No fields yet'}</p>
				<p class="empty-desc">{m.formEditorPreviewDragToAdd?.() ?? 'Drag fields from the palette to add'}</p>
			</div>
		{:else if currentPageFields.length === 0 && isDraggingFieldType}
			<!-- Empty form - show new row indicator with preview -->
			<div class="new-row-indicator" class:has-preview={hoverTarget?.type === 'new-row'}>
				{@render dropZoneCell('new-field', 0, 'new-row', 'left')}
				{@render dropZoneCell('new-field', 0, 'new-row', 'middle')}
				{@render dropZoneCell('new-field', 0, 'new-row', 'right')}
			</div>
		{:else}
			<!-- Field list for current page with row layout -->
			<div class="fields-list">
				<!-- Top reorder indicator (before first row) - for existing fields -->
				{#if fieldRows.length > 0}
					{@render dropZoneRow({ mode: 'reorder', rowIndex: -0.5, type: 'between-row', small: true })}
				{/if}

				{#each fieldRows as row, idx (row.rowIndex)}
					<!-- Between-row indicators (before each row except first) -->
					{#if idx > 0}
						{@const insertRowIndex = fieldRows[idx - 1].rowIndex + 0.5}
						{@render dropZoneRow({ mode: 'new-field', rowIndex: insertRowIndex, type: 'between-row', small: true })}
						{@render dropZoneRow({ mode: 'reorder', rowIndex: insertRowIndex, type: 'between-row', small: true })}
					{/if}

					<div
						class="field-row"
						class:half-width={row.isHalfWidth || (hoverTarget?.type === 'existing-row' && hoverTarget?.rowIndex === row.rowIndex) || (reorderTarget?.squeezeFieldId && reorderTarget?.rowIndex === row.rowIndex)}
						ondragover={(e) => {
							if (isDraggingFieldType) handleRowDragOver(e, row);
							else if (draggedFieldId) handleReorderRowDragOver(e, row);
						}}
						ondrop={(e) => {
							if (hoverTarget?.type === 'existing-row' && hoverTarget?.squeezeFieldId) {
								handleCellDrop(e, 'existing-row', hoverTarget.position, row.rowIndex, hoverTarget.squeezeFieldId);
							} else if (reorderTarget?.squeezeFieldId && reorderTarget?.rowIndex === row.rowIndex) {
								handleReorderDrop(e, row.rowIndex, reorderTarget.position, reorderTarget.squeezeFieldId);
							}
						}}
						role="region"
					>
						<!-- Preview field on left when squeezing existing field right (new field) -->
						{#if hoverTarget?.type === 'existing-row' && hoverTarget?.rowIndex === row.rowIndex && hoverTarget?.position === 'left'}
							<div class="field-wrapper preview-field" data-position="left">
								<div class="preview-placeholder">{m.formEditorPreviewNewField?.() ?? 'New field'}</div>
							</div>
						{/if}
						<!-- Preview field on left when reordering (squeeze) -->
						{#if reorderTarget?.squeezeFieldId && reorderTarget?.rowIndex === row.rowIndex && reorderTarget?.position === 'left'}
							<div class="field-wrapper preview-field reorder-preview" data-position="left">
								<div class="preview-placeholder">{m.formEditorPreviewMoveHere?.() ?? 'Move here'}</div>
							</div>
						{/if}

						<!-- Left empty side indicator (when row has only right field) - for new fields -->
						{#if isDraggingFieldType && row.fields.length === 1 && row.fields[0].data.column_position === 'right' && hoverTarget?.type !== 'existing-row'}
							<div
								class="empty-side-indicator"
								class:active={hoverTarget?.type === 'empty-side' && hoverTarget?.rowIndex === row.rowIndex && hoverTarget?.position === 'left'}
								ondragover={(e) => handleCellDragOver(e, 'empty-side', 'left', row.rowIndex)}
								ondragleave={handleCellDragLeave}
								ondrop={(e) => handleCellDrop(e, 'empty-side', 'left', row.rowIndex)}
								role="button"
								tabindex="-1"
							>
								{#if hoverTarget?.type === 'empty-side' && hoverTarget?.rowIndex === row.rowIndex && hoverTarget?.position === 'left'}
									<div class="preview-placeholder">{m.formEditorPreviewNewField?.() ?? 'New field'}</div>
								{:else}
									<AlignLeft class="zone-icon" />
								{/if}
							</div>
						{/if}

						<!-- Left reorder drop zone (when row has only right field) - for existing fields -->
						{#if draggedFieldId && row.fields.length === 1 && row.fields[0].data.column_position === 'right' && row.fields[0].data.id !== draggedFieldId}
							<div
								class="empty-side-indicator reorder-zone"
								class:active={reorderTarget?.rowIndex === row.rowIndex && reorderTarget?.position === 'left'}
								ondragover={(e) => handleReorderDragOver(e, row.rowIndex, 'left')}
								ondrop={(e) => handleReorderDrop(e, row.rowIndex, 'left')}
								role="button"
								tabindex="-1"
							>
								{#if reorderTarget?.rowIndex === row.rowIndex && reorderTarget?.position === 'left'}
									<div class="preview-placeholder">{m.formEditorPreviewMoveHere?.() ?? 'Move here'}</div>
								{:else}
									<AlignLeft class="zone-icon" />
								{/if}
							</div>
						{/if}

						{#each row.fields as trackedField (trackedField.data.id)}
							{@const isSqueezing = hoverTarget?.squeezeFieldId === trackedField.data.id || reorderTarget?.squeezeFieldId === trackedField.data.id}
							{@const squeezePosition = hoverTarget?.squeezeFieldId === trackedField.data.id ? hoverTarget?.position : (reorderTarget?.squeezeFieldId === trackedField.data.id ? reorderTarget?.position : null)}
							<div
								class="field-wrapper"
								class:squeezing={isSqueezing}
								class:squeeze-right={isSqueezing && squeezePosition === 'left'}
								class:squeeze-left={isSqueezing && squeezePosition === 'right'}
								data-position={isSqueezing ? (squeezePosition === 'left' ? 'right' : 'left') : trackedField.data.column_position}
								animate:flip={{ duration: 200 }}
							>
								<FieldCard
									field={trackedField.data}
									selected={selectedFieldId === trackedField.data.id}
									dragging={draggedFieldId === trackedField.data.id}
									halfWidth={row.isHalfWidth || isSqueezing}
									onSelect={() => onFieldSelect?.(trackedField.data.id)}
									onUpdate={(updates) => onFieldUpdate?.(trackedField.data.id, updates)}
									onDragStart={() => handleFieldDragStart(trackedField.data.id)}
									onDragEnd={handleFieldDragEnd}
								/>
							</div>
						{/each}

						<!-- Preview field on right when squeezing existing field left (new field) -->
						{#if hoverTarget?.type === 'existing-row' && hoverTarget?.rowIndex === row.rowIndex && hoverTarget?.position === 'right'}
							<div class="field-wrapper preview-field" data-position="right">
								<div class="preview-placeholder">{m.formEditorPreviewNewField?.() ?? 'New field'}</div>
							</div>
						{/if}
						<!-- Preview field on right when reordering (squeeze) -->
						{#if reorderTarget?.squeezeFieldId && reorderTarget?.rowIndex === row.rowIndex && reorderTarget?.position === 'right'}
							<div class="field-wrapper preview-field reorder-preview" data-position="right">
								<div class="preview-placeholder">{m.formEditorPreviewMoveHere?.() ?? 'Move here'}</div>
							</div>
						{/if}

						<!-- Right empty side indicator (when row has only left field) - for new fields -->
						{#if isDraggingFieldType && row.fields.length === 1 && row.fields[0].data.column_position === 'left' && hoverTarget?.type !== 'existing-row'}
							<div
								class="empty-side-indicator"
								class:active={hoverTarget?.type === 'empty-side' && hoverTarget?.rowIndex === row.rowIndex && hoverTarget?.position === 'right'}
								ondragover={(e) => handleCellDragOver(e, 'empty-side', 'right', row.rowIndex)}
								ondragleave={handleCellDragLeave}
								ondrop={(e) => handleCellDrop(e, 'empty-side', 'right', row.rowIndex)}
								role="button"
								tabindex="-1"
							>
								{#if hoverTarget?.type === 'empty-side' && hoverTarget?.rowIndex === row.rowIndex && hoverTarget?.position === 'right'}
									<div class="preview-placeholder">{m.formEditorPreviewNewField?.() ?? 'New field'}</div>
								{:else}
									<AlignRight class="zone-icon" />
								{/if}
							</div>
						{/if}

						<!-- Right reorder drop zone (when row has only left field) - for existing fields -->
						{#if draggedFieldId && row.fields.length === 1 && row.fields[0].data.column_position === 'left' && row.fields[0].data.id !== draggedFieldId}
							<div
								class="empty-side-indicator reorder-zone"
								class:active={reorderTarget?.rowIndex === row.rowIndex && reorderTarget?.position === 'right'}
								ondragover={(e) => handleReorderDragOver(e, row.rowIndex, 'right')}
								ondrop={(e) => handleReorderDrop(e, row.rowIndex, 'right')}
								role="button"
								tabindex="-1"
							>
								{#if reorderTarget?.rowIndex === row.rowIndex && reorderTarget?.position === 'right'}
									<div class="preview-placeholder">{m.formEditorPreviewMoveHere?.() ?? 'Move here'}</div>
								{:else}
									<AlignRight class="zone-icon" />
								{/if}
							</div>
						{/if}
					</div>
				{/each}

				<!-- Bottom indicators for new fields and reordering -->
				{#if isDraggingFieldType}
					<div class="new-row-indicator" class:has-preview={hoverTarget?.type === 'new-row'}>
						{@render dropZoneCell('new-field', nextRowIndex, 'new-row', 'left')}
						{@render dropZoneCell('new-field', nextRowIndex, 'new-row', 'middle')}
						{@render dropZoneCell('new-field', nextRowIndex, 'new-row', 'right')}
					</div>
				{/if}
				<div class="new-row-indicator reorder-zone" class:hidden={!draggedFieldId} class:has-preview={reorderTarget?.rowIndex === nextRowIndex}>
					{@render dropZoneCell('reorder', nextRowIndex, 'new-row', 'left')}
					{@render dropZoneCell('reorder', nextRowIndex, 'new-row', 'middle')}
					{@render dropZoneCell('reorder', nextRowIndex, 'new-row', 'right')}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.form-preview {
		width: 100%;
		max-width: 375px;
		min-height: 400px;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		box-shadow: 0 2px 8px oklch(0 0 0 / 0.08);
		position: relative;
		transition: border-color 0.15s ease;
		display: flex;
		flex-direction: column;
	}

	.form-preview.drag-over {
		border-color: hsl(var(--primary));
		border-style: dashed;
		box-shadow:
			0 0 0 3px hsl(var(--primary) / 0.1),
			0 4px 16px hsl(var(--primary) / 0.08);
	}

	.page-tabs {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.3);
		border-radius: 0.5rem 0.5rem 0 0;
		flex-shrink: 0;
	}

	.tabs-container {
		display: flex;
		gap: 0.25rem;
		flex: 1;
		overflow-x: auto;
	}

	.page-tab {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.375rem 0.5rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
	}

	.page-tab:hover {
		background: hsl(var(--background));
		color: hsl(var(--foreground));
	}

	.page-tab.active {
		background: hsl(var(--background));
		border-color: hsl(var(--border));
		color: hsl(var(--foreground));
		box-shadow: 0 1px 2px hsl(var(--foreground) / 0.05);
	}

	.tab-title {
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.page-tab :global(.page-title-input) {
		height: 20px;
		width: 80px;
		font-size: 0.75rem;
		padding: 0 0.25rem;
	}

	.edit-title,
	.delete-page,
	.save-title {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		background: transparent;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		opacity: 0;
		transition: all 0.15s ease;
	}

	.page-tab.active .edit-title,
	.page-tab.active .delete-page {
		opacity: 0.5;
	}

	.page-tab.active:hover .edit-title,
	.page-tab.active:hover .delete-page,
	.save-title {
		opacity: 1;
	}

	.edit-title:hover {
		background: hsl(var(--accent));
		color: hsl(var(--primary));
	}

	.delete-page:hover {
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
	}

	.save-title:hover {
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.page-tabs :global(.add-page-btn) {
		height: 28px;
		width: 28px;
		padding: 0;
		flex-shrink: 0;
	}

	.form-preview-inner {
		padding: 1rem;
		padding-bottom: 150px; /* Extra space for unlimited scrolling */
		flex: 1;
		position: relative;
		overflow-y: auto;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		text-align: center;
	}

	.empty-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		height: 64px;
		background: hsl(var(--muted));
		border-radius: 50%;
		color: hsl(var(--muted-foreground));
		margin-bottom: 1rem;
	}

	.empty-title {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 0.25rem;
	}

	.empty-desc {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.fields-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.field-row {
		display: flex;
		gap: 0.5rem;
		transition: all 0.2s ease;
	}

	.field-row.half-width {
		/* Two columns for half-width fields */
	}

	.field-row.half-width > :global(*) {
		flex: 1;
		min-width: 0;
	}

	.field-wrapper {
		min-width: 0;
		transition: flex 0.2s ease, margin 0.2s ease;
	}

	/* Field positioning based on data-position attribute */
	.field-wrapper[data-position="left"] {
		flex: 0 0 calc(50% - 0.25rem);
	}

	.field-wrapper[data-position="right"] {
		flex: 0 0 calc(50% - 0.25rem);
		margin-left: auto;
	}

	.field-wrapper[data-position="full"] {
		flex: 1;
	}

	/* Squeeze animation when hovering to add field beside full-width */
	.field-wrapper.squeezing {
		flex: 0 0 calc(50% - 0.25rem) !important;
	}

	.field-wrapper.squeeze-right {
		margin-left: auto;
		margin-right: 0;
	}

	.field-wrapper.squeeze-left {
		margin-right: auto;
		margin-left: 0;
	}

	/* Preview field styling */
	.field-wrapper.preview-field {
		opacity: 0.7;
		flex: 0 0 calc(50% - 0.25rem);
	}

	.field-wrapper.preview-field[data-position="left"] {
		margin-right: auto;
	}

	.field-wrapper.preview-field[data-position="right"] {
		margin-left: auto;
	}

	.field-wrapper.preview-field :global(.field-card) {
		border: 2px dashed hsl(var(--primary));
		background: hsl(var(--primary) / 0.05);
	}

	/* Preview placeholder - grey box shown during drag */
	.preview-placeholder {
		background: hsl(var(--muted));
		border: 2px dashed hsl(var(--primary));
		border-radius: 0.375rem;
		padding: 1rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
		text-align: center;
		width: 100%;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.preview-placeholder.small {
		padding: 0.5rem;
		min-height: 32px;
		font-size: 0.65rem;
	}

	.preview-placeholder.full-width {
		flex: 1;
	}

	/* New row indicator - L | M | R layout */
	.new-row-indicator {
		display: flex;
		border: 3px dashed #888;
		border-radius: 0.5rem;
		min-height: 60px;
		margin-top: 0.5rem;
		overflow: hidden;
		background: hsl(var(--muted) / 0.1);
	}

	.new-row-indicator.has-preview {
		min-height: 80px;
		border-color: hsl(var(--primary));
	}

	/* Drop zone cell - each L, M, R section */
	.drop-zone-cell {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		border-right: 3px dashed #888;
		transition: all 0.15s ease;
		cursor: pointer;
		background: hsl(var(--muted) / 0.2);
		padding: 0.5rem;
	}

	.drop-zone-cell:last-child {
		border-right: none;
	}

	.drop-zone-cell:hover,
	.drop-zone-cell.active {
		background: hsl(var(--primary) / 0.15);
		border-color: hsl(var(--primary));
	}

	.drop-zone-cell.active {
		background: hsl(var(--primary) / 0.2);
	}

	.drop-zone-cell.has-preview {
		padding: 0.25rem;
		background: hsl(var(--primary) / 0.1);
	}

	/* Zone icon styling */
	.drop-zone-cell :global(.zone-icon) {
		width: 20px;
		height: 20px;
		color: #666;
		transition: color 0.15s ease, transform 0.15s ease;
	}

	.drop-zone-cell:hover :global(.zone-icon),
	.drop-zone-cell.active :global(.zone-icon) {
		color: hsl(var(--primary));
		transform: scale(1.15);
	}

	/* Between-row indicator */
	.row-insert-indicator {
		height: 12px;
		margin: 0.25rem 0;
		display: flex;
		border: 2px dashed #888;
		border-radius: 4px;
		overflow: hidden;
		transition: all 0.2s ease;
		background: hsl(var(--muted) / 0.1);
	}

	.row-insert-indicator:hover,
	.row-insert-indicator.expanded {
		height: 50px;
		border-color: hsl(var(--primary));
	}

	.row-insert-indicator .drop-zone-cell {
		min-height: auto;
		height: 100%;
		border-right: 2px dashed #888;
	}

	.row-insert-indicator .drop-zone-cell:last-child {
		border-right: none;
	}

	.row-insert-indicator :global(.zone-icon) {
		width: 14px;
		height: 14px;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.row-insert-indicator:hover :global(.zone-icon),
	.row-insert-indicator.expanded :global(.zone-icon) {
		opacity: 1;
	}

	/* Empty side indicator for partial rows */
	.empty-side-indicator {
		flex: 0 0 calc(50% - 0.25rem);
		display: flex;
		align-items: center;
		justify-content: center;
		border: 3px dashed #888;
		border-radius: 0.375rem;
		min-height: 60px;
		transition: all 0.15s ease;
		cursor: pointer;
		background: hsl(var(--muted) / 0.15);
		padding: 0.25rem;
	}

	.empty-side-indicator:hover,
	.empty-side-indicator.active {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.1);
	}

	.empty-side-indicator :global(.zone-icon) {
		width: 22px;
		height: 22px;
		color: #666;
		transition: color 0.15s ease, transform 0.15s ease;
	}

	.empty-side-indicator:hover :global(.zone-icon),
	.empty-side-indicator.active :global(.zone-icon) {
		color: hsl(var(--primary));
		transform: scale(1.1);
	}

	/* Hidden class for elements that should stay in DOM but not cause layout shifts */
	.hidden {
		visibility: hidden;
		height: 0 !important;
		min-height: 0 !important;
		margin: 0 !important;
		padding: 0 !important;
		overflow: hidden;
		pointer-events: none;
	}

	/* Reorder drop zones - slightly different color to distinguish from new field zones */
	.reorder-zone {
		border-color: #6b7280;
	}

	.reorder-zone:hover,
	.reorder-zone.has-preview {
		border-color: hsl(var(--info, 221 83% 53%));
	}

	.reorder-zone .drop-zone-cell:hover,
	.reorder-zone .drop-zone-cell.active {
		background: hsl(var(--info, 221 83% 53%) / 0.15);
	}

	.reorder-zone .drop-zone-cell:hover :global(.zone-icon),
	.reorder-zone .drop-zone-cell.active :global(.zone-icon) {
		color: hsl(var(--info, 221 83% 53%));
	}

	.reorder-zone .preview-placeholder {
		border-color: hsl(var(--info, 221 83% 53%));
		background: hsl(var(--info, 221 83% 53%) / 0.1);
	}

	/* Reorder preview placeholder in field rows */
	.field-wrapper.reorder-preview .preview-placeholder {
		border-color: hsl(var(--info, 221 83% 53%));
		background: hsl(var(--info, 221 83% 53%) / 0.1);
	}
</style>
