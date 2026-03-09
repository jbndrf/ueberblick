<script lang="ts">
	import { tick } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { X, ChevronDown, ChevronUp, Calculator, GitCompare, Braces, Hash } from 'lucide-svelte';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';

	type FieldOption = { key: string; label: string };

	type Segment =
		| { type: 'text'; value: string }
		| { type: 'field'; fieldId: string };

	type Props = {
		value: string;
		fieldOptions: FieldOption[];
		onchange: (value: string) => void;
		placeholder?: string;
	};

	let { value, fieldOptions = [], onchange, placeholder = 'Expression...' }: Props = $props();

	// --- Parsing & Serialization ---

	function parseExpression(expr: string): Segment[] {
		if (!expr) return [{ type: 'text', value: '' }];

		const segments: Segment[] = [];
		const regex = /\{([^}]+)\}/g;
		let lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(expr)) !== null) {
			if (match.index > lastIndex) {
				segments.push({ type: 'text', value: expr.slice(lastIndex, match.index) });
			}
			segments.push({ type: 'field', fieldId: match[1] });
			lastIndex = match.index + match[0].length;
		}

		segments.push({ type: 'text', value: expr.slice(lastIndex) });

		// Normalize: ensure text between every pair of fields, at start and end
		const normalized: Segment[] = [];
		for (const seg of segments) {
			if (seg.type === 'field' && normalized.length > 0 && normalized[normalized.length - 1].type === 'field') {
				normalized.push({ type: 'text', value: '' });
			}
			normalized.push(seg);
		}
		if (normalized.length === 0 || normalized[0].type !== 'text') {
			normalized.unshift({ type: 'text', value: '' });
		}
		if (normalized[normalized.length - 1].type !== 'text') {
			normalized.push({ type: 'text', value: '' });
		}

		return normalized;
	}

	function serializeSegments(segs: Segment[]): string {
		return segs
			.map((s) => (s.type === 'field' ? `{${s.fieldId}}` : s.value))
			.join('');
	}

	// --- State ---

	let segments = $state<Segment[]>(parseExpression(value));
	let textInputs: (HTMLInputElement | null)[] = $state([]);
	let activeTextIndex = $state<number | null>(null);
	let operatorsOpen = $state(false);

	// Sync from external value changes
	$effect(() => {
		const parsed = parseExpression(value);
		const currentSerialized = serializeSegments(segments);
		if (value !== currentSerialized) {
			segments = parsed;
		}
	});

	// Field IDs currently in expression (unique, preserving first-occurrence order)
	let selectedFieldIds = $derived(
		[...new Set(
			segments
				.filter((s): s is { type: 'field'; fieldId: string } => s.type === 'field')
				.map((s) => s.fieldId)
		)]
	);

	function getFieldLabel(fieldId: string): string {
		return fieldOptions.find((o) => o.key === fieldId)?.label ?? fieldId;
	}

	// --- Emit changes ---

	function emitChange() {
		const serialized = serializeSegments(segments);
		if (serialized !== value) {
			onchange(serialized);
		}
	}

	// --- Text segment editing ---

	function handleTextInput(index: number, e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		segments[index] = { type: 'text', value: input.value };
		emitChange();
	}

	function handleTextKeydown(segIndex: number, e: KeyboardEvent) {
		const input = e.currentTarget as HTMLInputElement;

		if (e.key === 'Backspace' && input.selectionStart === 0 && input.selectionEnd === 0) {
			const prevFieldIdx = segIndex - 1;
			if (prevFieldIdx >= 0 && segments[prevFieldIdx].type === 'field') {
				e.preventDefault();
				removeFieldAtIndex(prevFieldIdx);
			}
		} else if (e.key === 'Delete' && input.selectionStart === input.value.length) {
			const nextFieldIdx = segIndex + 1;
			if (nextFieldIdx < segments.length && segments[nextFieldIdx].type === 'field') {
				e.preventDefault();
				removeFieldAtIndex(nextFieldIdx);
			}
		}
	}

	function handleTextFocus(segIndex: number) {
		activeTextIndex = segIndex;
	}

	function handleTextBlur() {
		setTimeout(() => { activeTextIndex = null; }, 150);
	}

	// --- Field badge operations ---

	function mergeAdjacentText(segs: Segment[]): Segment[] {
		const merged: Segment[] = [];
		for (const seg of segs) {
			if (seg.type === 'text' && merged.length > 0 && merged[merged.length - 1].type === 'text') {
				(merged[merged.length - 1] as { type: 'text'; value: string }).value += seg.value;
			} else {
				merged.push({ ...seg });
			}
		}
		if (merged.length === 0) {
			merged.push({ type: 'text', value: '' });
		}
		return merged;
	}

	function removeFieldAtIndex(fieldSegIndex: number) {
		const newSegments = [...segments];
		newSegments.splice(fieldSegIndex, 1);
		segments = mergeAdjacentText(newSegments);
		emitChange();
	}

	function removeAllFieldOccurrences(fieldId: string) {
		const newSegments = segments.filter(
			(s) => !(s.type === 'field' && s.fieldId === fieldId)
		);
		segments = mergeAdjacentText(newSegments);
		emitChange();
	}

	function insertFieldAtCursor(fieldId: string) {
		let insertSegIndex: number;
		let splitPos: number;

		if (activeTextIndex !== null) {
			insertSegIndex = activeTextIndex;
			const input = textInputs[getTextInputIndex(activeTextIndex)];
			splitPos = input?.selectionStart ?? (segments[insertSegIndex] as { type: 'text'; value: string }).value.length;
		} else {
			insertSegIndex = segments.length - 1;
			splitPos = (segments[insertSegIndex] as { type: 'text'; value: string }).value.length;
		}

		const textSeg = segments[insertSegIndex] as { type: 'text'; value: string };
		const before = textSeg.value.slice(0, splitPos);
		const after = textSeg.value.slice(splitPos);

		const newSegments = [
			...segments.slice(0, insertSegIndex),
			{ type: 'text' as const, value: before },
			{ type: 'field' as const, fieldId },
			{ type: 'text' as const, value: after },
			...segments.slice(insertSegIndex + 1)
		];

		segments = newSegments;
		emitChange();

		tick().then(() => {
			const afterIdx = segments.findIndex(
				(s, i) => i > insertSegIndex + 1 && s.type === 'text'
			);
			if (afterIdx >= 0) {
				const inputIdx = getTextInputIndex(afterIdx);
				textInputs[inputIdx]?.focus();
			}
		});
	}

	function getTextInputIndex(segIndex: number): number {
		let count = 0;
		for (let i = 0; i < segIndex; i++) {
			if (segments[i].type === 'text') count++;
		}
		return count;
	}

	// --- mobile-multi-select integration ---

	let isInternalUpdate = false;

	function handleFieldSelectionChange(newIds: string[]) {
		if (isInternalUpdate) return;

		const currentIds = [...selectedFieldIds];
		const added = newIds.filter((id) => !currentIds.includes(id));
		const removed = currentIds.filter((id) => !newIds.includes(id));

		if (added.length === 0 && removed.length === 0) return;

		isInternalUpdate = true;
		for (const id of added) {
			insertFieldAtCursor(id);
		}
		for (const id of removed) {
			removeAllFieldOccurrences(id);
		}
		setTimeout(() => { isInternalUpdate = false; }, 0);
	}

	// --- Operator/text insertion ---

	function insertOperator(op: string) {
		let targetSegIndex: number;
		let insertPos: number;

		if (activeTextIndex !== null) {
			targetSegIndex = activeTextIndex;
			const input = textInputs[getTextInputIndex(activeTextIndex)];
			insertPos = input?.selectionStart ?? (segments[targetSegIndex] as { type: 'text'; value: string }).value.length;
		} else {
			targetSegIndex = segments.length - 1;
			for (let i = segments.length - 1; i >= 0; i--) {
				if (segments[i].type === 'text') { targetSegIndex = i; break; }
			}
			insertPos = (segments[targetSegIndex] as { type: 'text'; value: string }).value.length;
		}

		const textSeg = segments[targetSegIndex] as { type: 'text'; value: string };
		const needSpaceBefore = insertPos > 0 && textSeg.value[insertPos - 1] !== ' ';
		const needSpaceAfter = insertPos < textSeg.value.length && textSeg.value[insertPos] !== ' ';
		const insertion = (needSpaceBefore ? ' ' : '') + op + (needSpaceAfter ? ' ' : '');
		const newValue = textSeg.value.slice(0, insertPos) + insertion + textSeg.value.slice(insertPos);

		segments[targetSegIndex] = { type: 'text', value: newValue };
		emitChange();

		tick().then(() => {
			const inputIdx = getTextInputIndex(targetSegIndex);
			const input = textInputs[inputIdx];
			if (input) {
				input.focus();
				const newCursorPos = insertPos + insertion.length;
				input.setSelectionRange(newCursorPos, newCursorPos);
			}
		});
	}

	// --- Badge drag-and-drop reorder ---

	let dragBadgeIndex = $state<number | null>(null);
	let dropTargetIndex = $state<number | null>(null);

	function handleBadgeDragStart(segIndex: number, e: DragEvent) {
		dragBadgeIndex = segIndex;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(segIndex));
		}
	}

	function handleBadgeDragOver(segIndex: number, e: DragEvent) {
		if (dragBadgeIndex === null) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropTargetIndex = segIndex;
	}

	function handleBadgeDrop(targetSegIndex: number, e: DragEvent) {
		e.preventDefault();
		if (dragBadgeIndex === null || dragBadgeIndex === targetSegIndex) {
			dragBadgeIndex = null;
			dropTargetIndex = null;
			return;
		}

		const draggedField = segments[dragBadgeIndex];
		if (draggedField.type !== 'field') return;

		const newSegments = [...segments];
		newSegments.splice(dragBadgeIndex, 1);

		let adjustedTarget = targetSegIndex;
		if (dragBadgeIndex < targetSegIndex) adjustedTarget--;

		newSegments.splice(adjustedTarget, 0, draggedField);

		const renormalized: Segment[] = [];
		for (const seg of newSegments) {
			if (seg.type === 'field' && renormalized.length > 0 && renormalized[renormalized.length - 1].type === 'field') {
				renormalized.push({ type: 'text', value: ' ' });
			}
			renormalized.push(seg);
		}
		if (renormalized.length === 0 || renormalized[0].type !== 'text') {
			renormalized.unshift({ type: 'text', value: '' });
		}
		if (renormalized[renormalized.length - 1].type !== 'text') {
			renormalized.push({ type: 'text', value: '' });
		}

		segments = mergeAdjacentText(renormalized);
		emitChange();
		dragBadgeIndex = null;
		dropTargetIndex = null;
	}

	function handleBadgeDragEnd() {
		dragBadgeIndex = null;
		dropTargetIndex = null;
	}

	function handleTextDragOver(segIndex: number, e: DragEvent) {
		if (dragBadgeIndex === null) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropTargetIndex = segIndex;
	}

	function handleTextDrop(targetSegIndex: number, e: DragEvent) {
		handleBadgeDrop(targetSegIndex, e);
	}

	// --- Operator data ---

	const OPERATOR_GROUPS = [
		{
			label: 'Math',
			icon: Calculator,
			items: ['+', '-', '*', '/', '%', '(', ')']
		},
		{
			label: 'Compare',
			icon: GitCompare,
			items: ['>', '<', '=', '!=', '>=', '<=']
		},
		{
			label: 'Logic',
			icon: Braces,
			items: ['AND', 'OR', 'NOT']
		},
		{
			label: 'Func',
			icon: Hash,
			items: ['IF()', 'SUM()', 'MIN()', 'MAX()', 'ROUND()']
		}
	];

	// --- Auto-size helper ---

	function inputWidth(val: string): string {
		const len = Math.max(val.length, 1);
		return `${len + 1}ch`;
	}

	const isEmpty = $derived(
		segments.length === 1 && segments[0].type === 'text' && segments[0].value === ''
	);
</script>

<div class="expression-input">
	<!-- Expression area (badges + text inputs) -->
	<div class="expression-area" class:empty={isEmpty}>
		{#each segments as segment, i (i)}
			{#if segment.type === 'text'}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<input
					bind:this={textInputs[getTextInputIndex(i)]}
					type="text"
					class="text-segment"
					class:drop-target={dropTargetIndex === i}
					value={segment.value}
					oninput={(e) => handleTextInput(i, e)}
					onkeydown={(e) => handleTextKeydown(i, e)}
					onfocus={() => handleTextFocus(i)}
					onblur={handleTextBlur}
					ondragover={(e) => handleTextDragOver(i, e)}
					ondrop={(e) => handleTextDrop(i, e)}
					placeholder={isEmpty ? placeholder : ''}
					style="width: {isEmpty ? '100%' : inputWidth(segment.value)}"
				/>
			{:else}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class="field-badge"
					class:dragging={dragBadgeIndex === i}
					class:drop-target={dropTargetIndex === i}
					draggable="true"
					ondragstart={(e) => handleBadgeDragStart(i, e)}
					ondragover={(e) => handleBadgeDragOver(i, e)}
					ondrop={(e) => handleBadgeDrop(i, e)}
					ondragend={handleBadgeDragEnd}
				>
					<Badge variant="secondary" class="gap-1 pr-0.5 text-xs shrink-0 cursor-grab">
						{getFieldLabel(segment.fieldId)}
						<button
							type="button"
							class="badge-remove"
							onclick={() => removeFieldAtIndex(i)}
							aria-label="Remove {getFieldLabel(segment.fieldId)}"
						>
							<X class="h-2.5 w-2.5" />
						</button>
					</Badge>
				</span>
			{/if}
		{/each}
	</div>

	<!-- Field picker (mobile-multi-select) -->
	<div class="field-picker">
		<MobileMultiSelect
			options={fieldOptions}
			selectedIds={selectedFieldIds}
			getOptionId={(opt) => opt.key}
			getOptionLabel={(opt) => opt.label}
			placeholder="Add fields..."
			onSelectedIdsChange={handleFieldSelectionChange}
			class="expression-field-select"
		/>
	</div>

	<!-- Operators toggle + panel -->
	<button class="operators-toggle" type="button" onclick={() => operatorsOpen = !operatorsOpen}>
		{#if operatorsOpen}
			<ChevronUp class="h-3 w-3" />
			<span>Hide operators</span>
		{:else}
			<ChevronDown class="h-3 w-3" />
			<span>Operators & functions</span>
		{/if}
	</button>

	{#if operatorsOpen}
		<div class="operators-panel">
			{#each OPERATOR_GROUPS as group (group.label)}
				{@const Icon = group.icon}
				<div class="op-section">
					<span class="op-section-label">
						<Icon class="h-3 w-3" />
						{group.label}
					</span>
					<div class="op-items">
						{#each group.items as item (item)}
							<button
								class="op-item"
								type="button"
								onclick={() => insertOperator(item)}
							>
								{item}
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.expression-input {
		display: flex;
		flex-direction: column;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		background: hsl(var(--background));
		overflow: hidden;
	}

	/* Expression area */
	.expression-area {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px;
		min-height: 2rem;
		padding: 0.25rem 0.375rem;
		cursor: text;
	}

	.expression-area:focus-within {
		box-shadow: inset 0 0 0 1px hsl(var(--ring) / 0.3);
	}

	.text-segment {
		border: none;
		outline: none;
		background: transparent;
		font-size: 0.75rem;
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
		color: hsl(var(--foreground));
		padding: 0;
		min-width: 1ch;
		line-height: 1.5rem;
	}

	.text-segment::placeholder {
		color: hsl(var(--muted-foreground));
		font-family: inherit;
	}

	.text-segment.drop-target {
		background: hsl(var(--primary) / 0.1);
		border-radius: 2px;
	}

	.field-badge {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		transition: opacity 0.15s, transform 0.15s;
	}

	.field-badge.dragging {
		opacity: 0.4;
		transform: scale(0.95);
	}

	.field-badge.drop-target {
		outline: 2px solid hsl(var(--primary));
		outline-offset: 1px;
		border-radius: 0.25rem;
	}

	.badge-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		cursor: pointer;
		padding: 1px;
		border-radius: 9999px;
		color: inherit;
		opacity: 0.6;
		transition: opacity 0.1s;
	}

	.badge-remove:hover {
		opacity: 1;
		background: hsl(var(--muted-foreground) / 0.2);
	}

	/* Field picker */
	.field-picker {
		border-top: 1px solid hsl(var(--border) / 0.5);
		padding: 0.25rem 0.375rem;
		background: hsl(var(--accent) / 0.08);
	}

	/* Override mobile-multi-select trigger to be compact */
	.field-picker :global(.expression-field-select button) {
		min-height: 1.75rem !important;
		padding: 0.125rem 0.5rem !important;
		font-size: 0.6875rem !important;
		border: 1px solid hsl(var(--border) / 0.6) !important;
	}

	/* Operators toggle */
	.operators-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.1875rem 0.5rem;
		border: none;
		border-top: 1px solid hsl(var(--border) / 0.5);
		background: hsl(var(--accent) / 0.08);
		color: hsl(var(--muted-foreground));
		font-size: 0.5625rem;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
	}

	.operators-toggle:hover {
		background: hsl(var(--accent) / 0.3);
		color: hsl(var(--foreground));
	}

	/* Operators panel */
	.operators-panel {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.375rem;
		border-top: 1px solid hsl(var(--border) / 0.5);
		background: hsl(var(--accent) / 0.05);
		max-height: 10rem;
		overflow-y: auto;
	}

	.op-section {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.op-section-label {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.5625rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding-bottom: 0.0625rem;
	}

	.op-items {
		display: flex;
		flex-wrap: wrap;
		gap: 0.125rem;
	}

	.op-item {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.125rem 0.375rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.1875rem;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		font-size: 0.625rem;
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
		font-weight: 500;
		min-width: 1.5rem;
		cursor: pointer;
		transition: background 0.1s, border-color 0.1s;
		white-space: nowrap;
	}

	.op-item:hover {
		background: hsl(var(--accent));
		border-color: hsl(var(--primary) / 0.3);
	}

	.op-item:active {
		background: hsl(var(--primary) / 0.1);
	}
</style>
