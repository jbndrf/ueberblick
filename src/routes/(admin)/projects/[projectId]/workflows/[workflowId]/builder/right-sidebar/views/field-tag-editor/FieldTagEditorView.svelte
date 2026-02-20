<script lang="ts">
	import { Tag, X, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { getAllTagTypes, type TagTypeDefinition } from '$lib/workflow-builder/tools/tag-types';
	import type { TagMapping, ToolsFormField, ToolsForm, WorkflowStage } from '$lib/workflow-builder';
	import TagSlot from './TagSlot.svelte';

	interface FieldGroup {
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	}

	interface Props {
		/** Current tag mappings for this workflow */
		tagMappings: TagMapping[];
		/** All form fields grouped by stage/form */
		allFormFields: FieldGroup[];
		/** Called when a mapping is set or cleared */
		onMappingChange: (tagType: string, fieldId: string | null, config?: Record<string, unknown>) => void;
		/** Called when config is updated for an existing mapping */
		onConfigChange: (tagType: string, config: Record<string, unknown>) => void;
		/** Delete callback - removes the field tag tool from the workflow */
		onDelete?: () => void;
		/** Close callback */
		onClose?: () => void;
	}

	let { tagMappings, allFormFields, onMappingChange, onConfigChange, onDelete, onClose }: Props = $props();

	const tagTypes: TagTypeDefinition[] = getAllTagTypes();

	/**
	 * Filter field groups to only include fields compatible with a tag type.
	 */
	function getCompatibleFieldGroups(tagType: TagTypeDefinition): FieldGroup[] {
		const result: FieldGroup[] = [];
		for (const group of allFormFields) {
			const compatible = group.fields.filter((f) =>
				tagType.compatibleFieldTypes.includes(f.field_type as any)
			);
			if (compatible.length > 0) {
				result.push({ ...group, fields: compatible });
			}
		}
		return result;
	}
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex items-center gap-2 border-b px-4 py-3">
		<Tag class="h-4 w-4 text-amber-500" />
		<div class="flex-1 min-w-0">
			<h3 class="text-sm font-semibold leading-tight">Field Tags</h3>
			<p class="text-xs text-muted-foreground">Assign semantic roles to form fields</p>
		</div>
		{#if onClose}
			<Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" onclick={onClose}>
				<X class="h-4 w-4" />
			</Button>
		{/if}
	</div>

	<!-- Tag slots -->
	<div class="flex-1 overflow-y-auto p-4 space-y-3">
		{#if tagTypes.length === 0}
			<p class="text-sm text-muted-foreground text-center py-8">
				No tag types available.
			</p>
		{:else}
			{#each tagTypes as tagTypeDef}
				<TagSlot
					tagType={tagTypeDef}
					mapping={tagMappings.find((m) => m.tagType === tagTypeDef.tagType)}
					compatibleFieldGroups={getCompatibleFieldGroups(tagTypeDef)}
					{onMappingChange}
					{onConfigChange}
				/>
			{/each}
		{/if}

		{#if allFormFields.length === 0}
			<Separator />
			<p class="text-xs text-muted-foreground text-center py-2">
				No form fields available yet. Add dropdown or multiple choice fields first.
			</p>
		{/if}
	</div>

	{#if onDelete}
		<div class="shrink-0 border-t px-4 py-3">
			<Button variant="destructive" size="sm" class="w-full" onclick={onDelete}>
				<Trash2 class="h-3.5 w-3.5 mr-1.5" />
				Delete Field Tags
			</Button>
		</div>
	{/if}
</div>
