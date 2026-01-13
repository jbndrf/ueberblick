<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';

	import type { FieldOption, SmartDropdownMapping } from '$lib/workflow-builder';

	type Props = {
		/** Whether the modal is open */
		open: boolean;
		/** Source field label for display */
		sourceFieldLabel: string;
		/** Tab options from the source field */
		tabOptions: FieldOption[];
		/** Current mappings */
		mappings: SmartDropdownMapping[];
		/** Callback when modal closes */
		onClose: () => void;
		/** Callback when mappings change */
		onUpdate: (mappings: SmartDropdownMapping[]) => void;
	};

	let { open, sourceFieldLabel, tabOptions, mappings, onClose, onUpdate }: Props = $props();

	// Local state for active tab
	let activeTab = $state<string>('');

	// Local state for mapping textareas (keyed by "when" value)
	let mappingTexts = $state<Record<string, string>>({});

	// Track initialization
	let initialized = $state(false);

	// Effective active tab (falls back to first option if not set)
	const effectiveActiveTab = $derived(
		activeTab && tabOptions.some((opt) => opt.label === activeTab)
			? activeTab
			: tabOptions[0]?.label || ''
	);

	// ==========================================================================
	// Helpers
	// ==========================================================================

	function parseOptionsText(text: string): FieldOption[] {
		return text
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.map((line) => {
				const commaIndex = line.indexOf(',');
				if (commaIndex === -1) {
					return { label: line };
				}
				const label = line.substring(0, commaIndex).trim();
				const description = line.substring(commaIndex + 1).trim();
				return { label, description: description || undefined };
			});
	}

	function optionsToText(options: FieldOption[]): string {
		return options
			.map((opt) => {
				if (opt.description) return `${opt.label}, ${opt.description}`;
				return opt.label;
			})
			.join('\n');
	}

	// ==========================================================================
	// Initialize from props when modal opens
	// ==========================================================================
	$effect(() => {
		if (!open) {
			initialized = false;
			return;
		}

		if (initialized) return;

		// Initialize mapping texts from mappings
		const newMappingTexts: Record<string, string> = {};
		for (const mapping of mappings) {
			newMappingTexts[mapping.when] = optionsToText(mapping.options);
		}
		mappingTexts = newMappingTexts;
		activeTab = '';
		initialized = true;
	});

	// ==========================================================================
	// Handlers
	// ==========================================================================

	function handleMappingTextBlur(when: string) {
		const text = mappingTexts[when] || '';
		const options = parseOptionsText(text);

		// Build updated mappings
		const newMappings = [...mappings];
		const existingIndex = newMappings.findIndex((m) => m.when === when);

		if (existingIndex >= 0) {
			if (options.length > 0) {
				newMappings[existingIndex] = { when, options };
			} else {
				newMappings.splice(existingIndex, 1);
			}
		} else if (options.length > 0) {
			newMappings.push({ when, options });
		}

		onUpdate(newMappings.filter((m) => m.options.length > 0));
	}

	function handleDone() {
		onClose();
	}

	function handleOpenChange(isOpen: boolean) {
		if (!isOpen) {
			onClose();
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Content class="smart-dropdown-modal">
		<Dialog.Header>
			<Dialog.Title>Configure Conditional Options</Dialog.Title>
			<Dialog.Description>
				Source field: <strong>{sourceFieldLabel}</strong>
			</Dialog.Description>
		</Dialog.Header>

		{#if tabOptions.length > 0}
			<div class="modal-body">
				<!-- Tab buttons -->
				<div class="mapping-tabs">
					{#each tabOptions as option (option.label)}
						<button
							class="mapping-tab"
							class:active={effectiveActiveTab === option.label}
							onclick={() => (activeTab = option.label)}
							type="button"
						>
							{option.label}
							{#if mappingTexts[option.label]?.trim()}
								<span class="tab-indicator"></span>
							{/if}
						</button>
					{/each}
				</div>

				<!-- Tab content -->
				<div class="mapping-tab-contents">
					{#each tabOptions as option (option.label)}
						<div class="mapping-tab-content" class:active={effectiveActiveTab === option.label}>
							<Label>Options when "{option.label}" is selected:</Label>
							<Textarea
								value={mappingTexts[option.label] || ''}
								oninput={(e) => (mappingTexts[option.label] = e.currentTarget.value)}
								onblur={() => handleMappingTextBlur(option.label)}
								placeholder={`Option 1\nOption 2\nOption 3, with explanation\nOption 4, to help users select`}
								rows={8}
							/>
							<p class="config-hint">One option per line. Use comma to add explanation: "Answer, explanation text"</p>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<p class="no-options">No options available from source field.</p>
		{/if}

		<Dialog.Footer>
			<Button onclick={handleDone}>Done</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	:global(.smart-dropdown-modal) {
		max-width: 640px !important;
		width: 100% !important;
	}

	.modal-body {
		display: flex;
		flex-direction: column;
		gap: 0;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.mapping-tabs {
		display: flex;
		overflow-x: auto;
		background: hsl(var(--muted) / 0.5);
		border-bottom: 1px solid hsl(var(--border));
	}

	.mapping-tab {
		position: relative;
		padding: 0.625rem 1rem;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		transition: all 0.15s ease;
		margin-bottom: -1px;
	}

	.mapping-tab:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--muted));
	}

	.mapping-tab.active {
		color: hsl(var(--primary));
		border-bottom-color: hsl(var(--primary));
		background: hsl(var(--background));
	}

	.tab-indicator {
		position: absolute;
		top: 0.5rem;
		right: 0.375rem;
		width: 6px;
		height: 6px;
		background: hsl(var(--primary));
		border-radius: 50%;
	}

	.mapping-tab-contents {
		background: hsl(var(--background));
	}

	.mapping-tab-content {
		display: none;
		padding: 1rem;
	}

	.mapping-tab-content.active {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.mapping-tab-content :global(label) {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}

	.mapping-tab-content :global(textarea) {
		font-size: 0.875rem;
		min-height: 180px;
	}

	.config-hint {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.no-options {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
		padding: 1rem;
		text-align: center;
	}
</style>
