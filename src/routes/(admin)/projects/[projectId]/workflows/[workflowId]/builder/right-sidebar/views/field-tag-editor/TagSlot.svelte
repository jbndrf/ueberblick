<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { X } from 'lucide-svelte';
	import type { TagTypeDefinition } from '$lib/workflow-builder/tools/tag-types';
	import type { FilterableConfig } from '$lib/workflow-builder/tools/tag-types';
	import type { TagMapping, ToolsFormField, ToolsForm, WorkflowStage } from '$lib/workflow-builder';

	interface FieldGroup {
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	}

	interface Props {
		tagType: TagTypeDefinition;
		/** Current mapping for this tag type (if any) */
		mapping: TagMapping | undefined;
		/** All form fields grouped by stage/form, pre-filtered to compatible types */
		compatibleFieldGroups: FieldGroup[];
		/** Called when a field is assigned or cleared */
		onMappingChange: (tagType: string, fieldId: string | null, config?: Record<string, unknown>) => void;
		/** Called when the config is updated */
		onConfigChange: (tagType: string, config: Record<string, unknown>) => void;
	}

	let { tagType, mapping, compatibleFieldGroups, onMappingChange, onConfigChange }: Props = $props();

	// Derive filterBy mode from mapping config
	const filterBy = $derived.by((): 'stage' | 'field' => {
		const cfg = mapping?.config as FilterableConfig | undefined;
		return cfg?.filterBy ?? 'field';
	});

	function handleFilterByChange(mode: 'stage' | 'field') {
		if (mode === 'stage') {
			// Stage mode: no field needed
			onMappingChange(tagType.tagType, null, { filterBy: 'stage' });
		} else {
			// Field mode: clear field, user picks one below
			onMappingChange(tagType.tagType, null, { filterBy: 'field' });
		}
	}

	function handleFieldSelect(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		if (value === '') {
			onMappingChange(tagType.tagType, null, { filterBy: 'field' });
		} else {
			onMappingChange(tagType.tagType, value, { filterBy: 'field' });
		}
	}

	function handleClear() {
		onMappingChange(tagType.tagType, null);
	}
</script>

<div class="rounded-lg border p-3 space-y-3">
	<div>
		<div class="flex items-center justify-between">
			<Label class="text-sm font-medium">{tagType.displayName}</Label>
			{#if mapping}
				<Button variant="ghost" size="icon" class="h-6 w-6" onclick={handleClear} title="Clear">
					<X class="h-3.5 w-3.5" />
				</Button>
			{/if}
		</div>
		<p class="text-xs text-muted-foreground mt-0.5">{tagType.description}</p>
	</div>

	<!-- Filter mode radio -->
	<div class="flex gap-4">
		<label class="flex items-center gap-1.5 text-sm cursor-pointer">
			<input
				type="radio"
				name="filterBy-{tagType.tagType}"
				value="stage"
				checked={mapping ? filterBy === 'stage' : false}
				onchange={() => handleFilterByChange('stage')}
				class="accent-primary"
			/>
			Filter by Stage
		</label>
		<label class="flex items-center gap-1.5 text-sm cursor-pointer">
			<input
				type="radio"
				name="filterBy-{tagType.tagType}"
				value="field"
				checked={mapping ? filterBy === 'field' : false}
				onchange={() => handleFilterByChange('field')}
				class="accent-primary"
			/>
			Filter by Field
		</label>
	</div>

	<!-- Field selector (only in field mode) -->
	{#if mapping && filterBy === 'field'}
		<div>
			<select
				class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
				value={mapping?.fieldId ?? ''}
				onchange={handleFieldSelect}
			>
				<option value="">-- Select a field --</option>
				{#each compatibleFieldGroups as group}
					<optgroup label="{group.stage.stage_name} / {group.form.name}">
						{#each group.fields as field}
							<option value={field.id}>{field.field_label}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
		</div>
	{/if}

	<!-- Stage mode hint -->
	{#if mapping && filterBy === 'stage'}
		<p class="text-xs text-muted-foreground">
			Participants will filter by workflow stage. Configure stage icons in the icon designer.
		</p>
	{/if}
</div>
