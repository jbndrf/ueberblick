<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import EntitySelector from '$lib/components/entity-selector.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';

	interface ArrayFieldProps {
		value: any[];
		rowId: string;
		editMode: boolean;
		onUpdate?: (value: any[]) => Promise<void>;
		entityConfig?: {
			getEntityId: (entity: any) => string;
			getEntityName: (entity: any) => string;
			getEntityDescription?: (entity: any) => string;
			availableEntities?: any[];
			allowCreate?: boolean;
			onCreateEntity?: (name: string) => Promise<any>;
			createAction?: string;
		};
		emptyText?: string;
	}

	let {
		value,
		rowId,
		editMode,
		onUpdate,
		entityConfig,
		emptyText = 'None'
	}: ArrayFieldProps = $props();

	let isEditing = $state(false);
	let selectedIds = $state<string[]>([]);
	let isSaving = $state(false);
	let entitySelectorLoaded = $state(false);

	const displayValue = $derived(
		!value || value.length === 0 ? [] : Array.isArray(value) ? value : [value]
	);

	// Convert IDs to entity objects for display
	const displayEntities = $derived(
		entityConfig
			? displayValue
					.map((item) => {
						if (typeof item === 'string') {
							// It's an ID, find the entity
							return entityConfig.availableEntities?.find(
								(e) => entityConfig.getEntityId(e) === item
							);
						}
						// It's already an entity object
						return item;
					})
					.filter((e) => e !== undefined)
			: displayValue
	);

	function startEditing() {
		if (!editMode || !onUpdate || !entityConfig) return;
		// Initialize selected IDs from current value (which are already IDs)
		selectedIds = displayValue.map((item) =>
			typeof item === 'string' ? item : entityConfig!.getEntityId(item)
		);
		isEditing = true;
		// Lazy load entity selector only when editing starts
		entitySelectorLoaded = true;
	}

	function cancelEditing() {
		isEditing = false;
		selectedIds = [];
	}

	async function saveSelection() {
		if (isSaving || !onUpdate) return;

		isSaving = true;

		try {
			await onUpdate(selectedIds);
			toast.success(m.commonSave());
			isEditing = false;
			entitySelectorLoaded = false;
		} catch (error) {
			console.error('Error updating array field:', error);
			toast.error('Failed to update');
		} finally {
			isSaving = false;
		}
	}
</script>

{#if isEditing && entityConfig}
	<div class="flex flex-col gap-2 w-full">
		{#if entitySelectorLoaded}
			<EntitySelector
				bind:selectedEntityIds={selectedIds}
				bind:availableEntities={entityConfig.availableEntities}
				getEntityId={entityConfig.getEntityId}
				getEntityName={entityConfig.getEntityName}
				getEntityDescription={entityConfig.getEntityDescription}
				allowCreate={entityConfig.allowCreate ?? false}
				onCreateEntity={entityConfig.onCreateEntity}
				createAction={entityConfig.createAction}
				placeholder="Type # to see all or type to search/create..."
			/>
		{:else}
			<div class="text-sm text-muted-foreground">Loading...</div>
		{/if}
		<div class="flex items-center gap-2">
			<Button
				variant="ghost"
				size="sm"
				onclick={saveSelection}
				disabled={isSaving}
				class="h-7 px-2 text-xs"
			>
				{m.commonSave()}
			</Button>
			<Button
				variant="ghost"
				size="sm"
				onclick={cancelEditing}
				disabled={isSaving}
				class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
			>
				{m.commonCancel()}
			</Button>
		</div>
	</div>
{:else}
	<div class="flex items-center gap-2 w-full">
		<button
			type="button"
			onclick={startEditing}
			class="flex-1 text-left {editMode && onUpdate && entityConfig
				? 'hover:bg-muted/50 cursor-pointer'
				: 'cursor-default'} px-2 py-1 -mx-2 -my-1 rounded transition-colors"
			disabled={!editMode || !onUpdate || !entityConfig}
		>
			{#if displayEntities.length > 0}
				<div class="flex flex-wrap gap-1">
					{#each displayEntities as entity}
						{@const name = entityConfig?.getEntityName(entity) ?? String(entity)}
						<Badge variant="secondary" class="text-xs">{name}</Badge>
					{/each}
				</div>
			{:else}
				<span class="text-sm text-muted-foreground">{emptyText}</span>
			{/if}
		</button>
	</div>
{/if}
