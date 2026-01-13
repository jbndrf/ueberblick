<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Type } from 'lucide-svelte';
	import { fieldTypeIcons, type ToolsFormField } from '$lib/workflow-builder';

	type Props = {
		field: ToolsFormField;
		isSelected: boolean;
		onToggle?: () => void;
	};

	let { field, isSelected, onToggle }: Props = $props();

	const Icon = $derived(fieldTypeIcons[field.field_type] || Type);
</script>

<button type="button" class="field-item" onclick={onToggle}>
	<Checkbox checked={isSelected} />
	<div class="field-info">
		<span class="field-label">
			{field.field_label}
			{#if field.is_required}
				<span class="required">*</span>
			{/if}
		</span>
	</div>
	<div class="field-type-icon">
		<Icon class="h-3 w-3" />
	</div>
</button>

<style>
	.field-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.375rem 0.5rem;
		border: none;
		background: transparent;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: background 0.15s ease;
		text-align: left;
	}

	.field-item:hover {
		background: hsl(var(--accent));
	}

	.field-info {
		flex: 1;
		min-width: 0;
	}

	.field-label {
		font-size: 0.8125rem;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
	}

	.required {
		color: hsl(var(--destructive));
		margin-left: 0.125rem;
	}

	.field-type-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		background: hsl(var(--muted));
		border-radius: 0.25rem;
		color: hsl(var(--muted-foreground));
	}
</style>
