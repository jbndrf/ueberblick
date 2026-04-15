<script lang="ts">
	import { untrack } from 'svelte';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import * as Dialog from '$lib/components/ui/dialog';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import { page } from '$app/stores';
	import { getPocketBase } from '$lib/pocketbase';
	import * as m from '$lib/paraglide/messages';

	import type { EntitySourceType, EntitySelectorOptions } from '$lib/workflow-builder';

	type Role = {
		id: string;
		name: string;
		description?: string;
	};

	type CustomTable = {
		id: string;
		display_name: string;
		description?: string;
	};

	type CustomTableColumn = {
		id: string;
		column_name: string;
		column_type: string;
		sort_order?: number;
	};

	type MarkerCategory = {
		id: string;
		name: string;
		description?: string;
	};

	type Props = {
		/** Whether the modal is open */
		open: boolean;
		/** Current options */
		options: EntitySelectorOptions;
		/** Available roles (passed from parent) */
		roles?: Role[];
		/** Callback when modal closes */
		onClose: () => void;
		/** Callback when options change */
		onUpdate: (options: EntitySelectorOptions) => void;
	};

	let { open = $bindable(), options, roles = [], onClose, onUpdate }: Props = $props();

	// ==========================================================================
	// Local State
	// ==========================================================================
	let localOptions = $state<EntitySelectorOptions>({ source_type: 'custom_table' });

	// Data for dropdowns
	let customTables = $state<CustomTable[]>([]);
	let tableColumns = $state<CustomTableColumn[]>([]);
	let markerCategories = $state<MarkerCategory[]>([]);
	let loading = $state(false);

	// Derived selections for mobile-multi-select
	let selectedTableIds = $state<string[]>([]);
	let selectedColumnIds = $state<string[]>([]);
	let selectedCategoryIds = $state<string[]>([]);
	let selfSelectRoleIds = $state<string[]>([]);
	let anySelectRoleIds = $state<string[]>([]);

	// Get project ID from route
	const projectId = $derived($page.params.projectId);

	// Track initialization to prevent effect loops
	let initialized = $state(false);
	let previousTableId = $state<string | undefined>(undefined);

	// ==========================================================================
	// Initialize when modal opens
	// ==========================================================================
	$effect(() => {
		if (!open) {
			// Reset when modal closes
			untrack(() => {
				initialized = false;
				previousTableId = undefined;
			});
			return;
		}

		// Only initialize once per open
		const alreadyInitialized = untrack(() => initialized);
		if (alreadyInitialized) return;

		// Copy options to local state
		untrack(() => {
			localOptions = { ...options };

			// Initialize selection arrays
			const tableId = options.custom_table_id;
			selectedTableIds = tableId ? [tableId] : [];
			selectedColumnIds = options.display_field ? [options.display_field] : [];
			selectedCategoryIds = options.marker_category_id ? [options.marker_category_id] : [];
			selfSelectRoleIds = [...(options.self_select_roles || [])];
			anySelectRoleIds = [...(options.any_select_roles || [])];

			// Track initial table ID
			previousTableId = tableId;
			initialized = true;
		});

		// Load data
		loadData();
	});

	// Watch for table selection changes (user-initiated)
	$effect(() => {
		const currentTableId = selectedTableIds[0];
		const prev = untrack(() => previousTableId);
		const isInit = untrack(() => initialized);

		// Only run after initialization and when table actually changed by user
		if (isInit && currentTableId !== prev) {
			untrack(() => {
				previousTableId = currentTableId;
				if (currentTableId) {
					selectedColumnIds = []; // Clear column selection
					loadTableColumns(currentTableId);
				} else {
					tableColumns = [];
				}
			});
		}
	});

	// ==========================================================================
	// Data Loading
	// ==========================================================================
	async function loadData() {
		if (!projectId) return;
		loading = true;

		try {
			const pb = getPocketBase();
			// Load custom tables and marker categories in parallel
			const [tables, categories] = await Promise.all([
				pb.collection('custom_tables').getFullList<CustomTable>({
					filter: `project_id = "${projectId}"`,
					sort: 'display_name'
				}),
				pb.collection('marker_categories').getFullList<MarkerCategory>({
					filter: `project_id = "${projectId}"`,
					sort: 'name'
				})
			]);

			customTables = tables;
			markerCategories = categories;

			// If a table is already selected, load its columns
			if (selectedTableIds[0]) {
				await loadTableColumns(selectedTableIds[0]);
			}
		} catch (error) {
			console.error('Failed to load entity selector data:', error);
		} finally {
			loading = false;
		}
	}

	async function loadTableColumns(tableId: string) {
		try {
			const pb = getPocketBase();
			const [table, columns] = await Promise.all([
				pb.collection('custom_tables').getOne<CustomTable & { main_column: string }>(tableId),
				pb.collection('custom_table_columns').getFullList<CustomTableColumn>({
					filter: `table_id = "${tableId}"`,
					sort: 'sort_order'
				})
			]);
			// Include the main column as the first option
			const mainCol: CustomTableColumn = {
				id: '__main__',
				column_name: table.main_column,
				column_type: 'text',
				sort_order: -1
			};
			tableColumns = [mainCol, ...columns];
		} catch (error) {
			console.error('Failed to load table columns:', error);
			tableColumns = [];
		}
	}

	// ==========================================================================
	// Handlers
	// ==========================================================================
	function handleAllowMultipleChange(checked: boolean) {
		localOptions = { ...localOptions, allow_multiple: checked };
	}

	function handleDone() {
		// Build final options based on source type
		const finalOptions: EntitySelectorOptions = {
			source_type: localOptions.source_type,
			allow_multiple: localOptions.allow_multiple
		};

		if (localOptions.source_type === 'custom_table') {
			finalOptions.custom_table_id = selectedTableIds[0];
			finalOptions.display_field = selectedColumnIds[0];
			finalOptions.value_field = 'id'; // Always store row ID
		} else if (localOptions.source_type === 'marker_category') {
			finalOptions.marker_category_id = selectedCategoryIds[0];
		} else if (localOptions.source_type === 'participants' || localOptions.source_type === 'roles') {
			finalOptions.self_select_roles = selfSelectRoleIds;
			finalOptions.any_select_roles = anySelectRoleIds;
		}

		onUpdate(finalOptions);
		onClose();
	}

	function handleOpenChange(isOpen: boolean) {
		if (!isOpen) {
			onClose();
		}
	}

	// ==========================================================================
	// Derived UI labels
	// ==========================================================================
	const sourceTypeLabel = $derived(
		{
			custom_table: (m.formEditorEntitySelectorModalSourceCustomTable?.() ?? 'Custom Table'),
			marker_category: (m.formEditorEntitySelectorModalSourceMarkers?.() ?? 'Markers'),
			participants: (m.formEditorEntitySelectorModalSourceParticipants?.() ?? 'Participants'),
			roles: (m.formEditorEntitySelectorModalSourceRoles?.() ?? 'Roles')
		}[localOptions.source_type]
	);

	const entityName = $derived(localOptions.source_type === 'participants' ? (m.formEditorEntitySelectorModalEntityParticipants?.() ?? 'participants') : (m.formEditorEntitySelectorModalEntityRoles?.() ?? 'roles'));
	const selfText = $derived(
		localOptions.source_type === 'participants' ? (m.formEditorEntitySelectorModalSelfTextParticipants?.() ?? 'themselves') : (m.formEditorEntitySelectorModalSelfTextRoles?.() ?? 'their own role')
	);
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Content class="entity-selector-modal" interactOutsideBehavior="ignore" onFocusOutside={(e) => e.preventDefault()}>
		<Dialog.Header>
			<Dialog.Title>{m.formEditorEntitySelectorModalTitle?.() ?? 'Configure'} {sourceTypeLabel} {m.formEditorEntitySelectorModalTitleSuffix?.() ?? 'Selector'}</Dialog.Title>
			<Dialog.Description>
				{#if localOptions.source_type === 'custom_table'}
					{m.formEditorEntitySelectorModalDescCustomTable?.() ?? 'Select which table and field to display.'}
				{:else if localOptions.source_type === 'marker_category'}
					{m.formEditorEntitySelectorModalDescMarkerCategory?.() ?? 'Select which marker category to use.'}
				{:else}
					{m.formEditorEntitySelectorModalDescRolesParticipants?.({ selfText, entityName }) ?? `Configure which roles can select ${selfText} vs any ${entityName}.`}
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<div class="modal-body">
			<!-- Allow Multiple Toggle (always shown) -->
			<div class="config-row">
				<div class="config-row-text">
					<Label>{m.formEditorEntitySelectorModalAllowMultipleLabel?.() ?? 'Allow Multiple Selections'}</Label>
					<p class="config-hint">{m.formEditorEntitySelectorModalAllowMultipleHint?.() ?? 'Users can select more than one item.'}</p>
				</div>
				<Switch
					checked={localOptions.allow_multiple ?? false}
					onCheckedChange={handleAllowMultipleChange}
				/>
			</div>

			<!-- Custom Table Configuration -->
			{#if localOptions.source_type === 'custom_table'}
				<div class="config-section">
					<Label>{m.formEditorEntitySelectorModalCustomTableLabel?.() ?? 'Custom Table'}</Label>
					<MobileMultiSelect
						options={customTables}
						getOptionId={(t) => t.id}
						getOptionLabel={(t) => t.display_name}
						getOptionDescription={(t) => t.description}
						singleSelect={true}
						bind:selectedIds={selectedTableIds}
						placeholder={m.formEditorEntitySelectorModalSelectTablePlaceholder?.() ?? 'Select a table...'}
						disablePortal
					/>
				</div>

				{#if selectedTableIds.length > 0}
					<div class="config-section">
						<Label>{m.formEditorEntitySelectorModalDisplayFieldLabel?.() ?? 'Display Field'}</Label>
						<p class="config-hint">{m.formEditorEntitySelectorModalDisplayFieldHint?.() ?? 'Which column to show as the option label.'}</p>
						<MobileMultiSelect
							options={tableColumns}
							getOptionId={(c) => c.column_name}
							getOptionLabel={(c) => c.column_name}
							getOptionDescription={(c) => c.column_type}
							singleSelect={true}
							bind:selectedIds={selectedColumnIds}
							placeholder={m.formEditorEntitySelectorModalSelectColumnPlaceholder?.() ?? 'Select a column...'}
							disablePortal
						/>
					</div>
				{/if}
			{/if}

			<!-- Marker Category Configuration -->
			{#if localOptions.source_type === 'marker_category'}
				<div class="config-section">
					<Label>{m.formEditorEntitySelectorModalMarkerCategoryLabel?.() ?? 'Marker Category'}</Label>
					<MobileMultiSelect
						options={markerCategories}
						getOptionId={(c) => c.id}
						getOptionLabel={(c) => c.name}
						getOptionDescription={(c) => c.description}
						singleSelect={true}
						bind:selectedIds={selectedCategoryIds}
						placeholder={m.formEditorEntitySelectorModalSelectCategoryPlaceholder?.() ?? 'Select a category...'}
						disablePortal
					/>
				</div>
			{/if}

			<!-- Participants/Roles Configuration -->
			{#if localOptions.source_type === 'participants' || localOptions.source_type === 'roles'}
				<div class="config-section">
					<Label>{m.formEditorEntitySelectorModalSelfSelectLabel?.() ?? 'Self-Select Only'}</Label>
					<p class="config-hint">{m.formEditorEntitySelectorModalSelfSelectHint?.({ selfText }) ?? `These roles can only select ${selfText}.`}</p>
					<MobileMultiSelect
						options={roles}
						getOptionId={(r) => r.id}
						getOptionLabel={(r) => r.name}
						getOptionDescription={(r) => r.description}
						bind:selectedIds={selfSelectRoleIds}
						placeholder={m.formEditorEntitySelectorModalSelectRolesPlaceholder?.() ?? 'Select roles...'}
						disablePortal
					/>
				</div>

				<div class="config-section">
					<Label>{m.formEditorEntitySelectorModalAnySelectLabel?.() ?? 'Can Select Anyone'}</Label>
					<p class="config-hint">{m.formEditorEntitySelectorModalAnySelectHint?.({ entityName }) ?? `These roles can select any ${entityName} from the project.`}</p>
					<MobileMultiSelect
						options={roles}
						getOptionId={(r) => r.id}
						getOptionLabel={(r) => r.name}
						getOptionDescription={(r) => r.description}
						bind:selectedIds={anySelectRoleIds}
						placeholder={m.formEditorEntitySelectorModalSelectRolesPlaceholder?.() ?? 'Select roles...'}
						disablePortal
					/>
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button onclick={handleDone}>{m.formEditorEntitySelectorModalDoneButton?.() ?? 'Done'}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	:global(.entity-selector-modal) {
		max-width: 500px !important;
		width: 100% !important;
	}

	.modal-body {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 0.5rem 0;
	}

	.config-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem;
		background: hsl(var(--muted) / 0.5);
		border-radius: 0.5rem;
	}

	.config-row-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.config-row-text :global(label) {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.config-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.config-section :global(label) {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.config-hint {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}
</style>
