<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Settings2 } from 'lucide-svelte';

	import * as m from '$lib/paraglide/messages';
	import type { EntitySourceType, EntitySelectorOptions } from '$lib/workflow-builder';
	import EntitySelectorModal from './EntitySelectorModal.svelte';

	type Role = {
		id: string;
		name: string;
		description?: string;
	};

	type Props = {
		/** Current field options */
		fieldOptions?: Record<string, unknown>;
		/** Available roles (passed from parent) */
		roles?: Role[];
		/** Callback when config changes */
		onUpdate?: (options: EntitySelectorOptions) => void;
	};

	let { fieldOptions, roles = [], onUpdate }: Props = $props();

	// ==========================================================================
	// Local State
	// ==========================================================================
	let sourceType = $state<EntitySourceType>('custom_table');
	let modalOpen = $state(false);

	// Full options object (managed by modal)
	let currentOptions = $state<EntitySelectorOptions>({
		source_type: 'custom_table'
	});

	// Track initialization
	let initialized = $state(false);

	// ==========================================================================
	// Initialize from props
	// ==========================================================================
	$effect(() => {
		if (initialized) return;

		const opts = fieldOptions as EntitySelectorOptions | undefined;
		if (opts) {
			sourceType = opts.source_type || 'custom_table';
			currentOptions = { ...opts };
		}

		initialized = true;
	});

	// ==========================================================================
	// Handlers
	// ==========================================================================
	function handleSourceTypeChange(value: string | undefined) {
		if (!value) return;
		sourceType = value as EntitySourceType;

		// Update options with new source type, clear source-specific values
		currentOptions = {
			source_type: sourceType,
			allow_multiple: currentOptions.allow_multiple
		};

		onUpdate?.(currentOptions);
	}

	function handleModalUpdate(options: EntitySelectorOptions) {
		currentOptions = options;
		sourceType = options.source_type;
		onUpdate?.(options);
	}

	// ==========================================================================
	// Derived values for summary display
	// ==========================================================================
	const sourceTypeLabel = $derived({
		custom_table: (m.formEditorEntitySelectorConfigCustomTable?.() ?? 'Custom Table'),
		marker_category: (m.formEditorEntitySelectorConfigMarkers?.() ?? 'Markers'),
		participants: (m.formEditorEntitySelectorConfigParticipants?.() ?? 'Participants'),
		roles: (m.formEditorEntitySelectorConfigRoles?.() ?? 'Roles')
	}[sourceType]);

	const isConfigured = $derived(() => {
		if (sourceType === 'custom_table') {
			return !!currentOptions.custom_table_id && !!currentOptions.display_field;
		}
		if (sourceType === 'marker_category') {
			return !!currentOptions.marker_category_id;
		}
		if (sourceType === 'participants' || sourceType === 'roles') {
			return (currentOptions.self_select_roles?.length || 0) > 0 ||
				   (currentOptions.any_select_roles?.length || 0) > 0;
		}
		return false;
	});
</script>

<div class="entity-selector-config">
	<!-- Source Type Selection (vertical stack) -->
	<div class="config-section">
		<Label>{m.formEditorEntitySelectorConfigSelectFrom?.() ?? 'Select From'}</Label>
		<RadioGroup.Root value={sourceType} onValueChange={handleSourceTypeChange}>
			<div class="source-type-list">
				<div class="source-type-option">
					<RadioGroup.Item value="custom_table" id="src-custom-table" />
					<Label for="src-custom-table">{m.formEditorEntitySelectorConfigCustomTable?.() ?? 'Custom Table'}</Label>
				</div>
				<div class="source-type-option">
					<RadioGroup.Item value="marker_category" id="src-marker" />
					<Label for="src-marker">{m.formEditorEntitySelectorConfigMarkers?.() ?? 'Markers'}</Label>
				</div>
				<div class="source-type-option">
					<RadioGroup.Item value="participants" id="src-participants" />
					<Label for="src-participants">{m.formEditorEntitySelectorConfigParticipants?.() ?? 'Participants'}</Label>
				</div>
				<div class="source-type-option">
					<RadioGroup.Item value="roles" id="src-roles" />
					<Label for="src-roles">{m.formEditorEntitySelectorConfigRoles?.() ?? 'Roles'}</Label>
				</div>
			</div>
		</RadioGroup.Root>
	</div>

	<!-- Configure Button -->
	<div class="config-section">
		<Button
			variant="outline"
			class="configure-button"
			onclick={() => (modalOpen = true)}
		>
			<Settings2 class="h-4 w-4" />
			{m.formEditorEntitySelectorConfigConfigureButton?.({ sourceTypeLabel: sourceTypeLabel ?? '' }) ?? `Configure ${sourceTypeLabel}`}
			{#if isConfigured()}
				<span class="configured-badge">{m.formEditorEntitySelectorConfigConfigured?.() ?? 'Configured'}</span>
			{/if}
		</Button>
	</div>
</div>

<!-- Configuration Modal -->
<EntitySelectorModal
	bind:open={modalOpen}
	options={currentOptions}
	{roles}
	onClose={() => (modalOpen = false)}
	onUpdate={handleModalUpdate}
/>

<style>
	.entity-selector-config {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.config-section {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.config-section :global(label) {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}

	.source-type-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.source-type-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.source-type-option:hover {
		background: hsl(var(--accent));
	}

	.source-type-option:has(:global([data-state="checked"])) {
		background: hsl(var(--primary) / 0.1);
		border-color: hsl(var(--primary) / 0.3);
	}

	.source-type-option :global(label) {
		cursor: pointer;
		font-size: 0.8125rem;
		color: hsl(var(--foreground));
	}

	:global(.configure-button) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		justify-content: center;
	}

	.configured-badge {
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 0.125rem 0.5rem;
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
		border-radius: 9999px;
	}
</style>
