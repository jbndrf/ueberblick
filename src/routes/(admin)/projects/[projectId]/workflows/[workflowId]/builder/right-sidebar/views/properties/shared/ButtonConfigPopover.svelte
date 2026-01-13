<script lang="ts">
	import { untrack } from 'svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import * as Popover from '$lib/components/ui/popover';

	import type { VisualConfig } from '$lib/workflow-builder';

	type Props = {
		/** Current visual config */
		config: VisualConfig;
		/** Callback when config changes */
		onConfigChange?: (config: VisualConfig) => void;
		/** Default button label when not set */
		defaultLabel?: string;
		/** Default button color when not set */
		defaultColor?: string;
	};

	let {
		config,
		onConfigChange,
		defaultLabel = 'Action',
		defaultColor = '#3b82f6'
	}: Props = $props();

	let popoverOpen = $state(false);

	// Get current values from config (derived, not state)
	const buttonLabel = $derived(config.button_label || '');
	const buttonColor = $derived(config.button_color || defaultColor);
	const requiresConfirmation = $derived(config.requires_confirmation || false);
	const confirmationMessage = $derived(config.confirmation_message || 'Are you sure you want to proceed?');

	// Display label for the button preview
	const displayLabel = $derived(buttonLabel || defaultLabel);

	// Notify parent with updated config
	function updateConfig(updates: Partial<VisualConfig>) {
		const currentConfig = untrack(() => config);
		onConfigChange?.({
			button_label: updates.button_label !== undefined ? updates.button_label : currentConfig.button_label,
			button_color: updates.button_color !== undefined ? updates.button_color : currentConfig.button_color,
			requires_confirmation: updates.requires_confirmation !== undefined ? updates.requires_confirmation : currentConfig.requires_confirmation,
			confirmation_message: updates.confirmation_message !== undefined ? updates.confirmation_message : currentConfig.confirmation_message
		});
	}

	function handleLabelChange(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		updateConfig({ button_label: value || undefined });
	}

	function handleColorChange(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		updateConfig({ button_color: value !== defaultColor ? value : undefined });
	}

	function handleConfirmationToggle(checked: boolean) {
		updateConfig({
			requires_confirmation: checked || undefined,
			confirmation_message: checked ? (config.confirmation_message || 'Are you sure you want to proceed?') : undefined
		});
	}

	function handleConfirmationMessageChange(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		updateConfig({ confirmation_message: value });
	}
</script>

<Popover.Root bind:open={popoverOpen}>
	<Popover.Trigger>
		<button
			class="button-preview"
			style="--btn-color: {buttonColor}"
			type="button"
		>
			{displayLabel}
		</button>
	</Popover.Trigger>

	<Popover.Content class="button-config-popover" align="end" sideOffset={4}>
		<div class="popover-header">
			<span class="popover-title">Button Configuration</span>
		</div>

		<div class="popover-content">
			<div class="form-field">
				<Label for="btn-label">Button Label</Label>
				<Input
					id="btn-label"
					value={buttonLabel}
					oninput={handleLabelChange}
					placeholder={defaultLabel}
				/>
			</div>

			<div class="form-field">
				<Label for="btn-color">Button Color</Label>
				<div class="color-picker">
					<input
						type="color"
						id="btn-color"
						value={buttonColor}
						oninput={handleColorChange}
						class="color-input"
					/>
					<Input
						value={buttonColor}
						oninput={handleColorChange}
						placeholder={defaultColor}
						class="color-text"
					/>
				</div>
			</div>

			<div class="form-field-switch">
				<div class="switch-info">
					<Label for="btn-confirm">Requires Confirmation</Label>
					<p class="switch-description">
						Show a confirmation dialog
					</p>
				</div>
				<Switch
					id="btn-confirm"
					checked={requiresConfirmation}
					onCheckedChange={handleConfirmationToggle}
				/>
			</div>

			{#if requiresConfirmation}
				<div class="form-field">
					<Label for="btn-confirm-msg">Confirmation Message</Label>
					<Input
						id="btn-confirm-msg"
						value={confirmationMessage}
						oninput={handleConfirmationMessageChange}
						placeholder="Are you sure you want to proceed?"
					/>
				</div>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>

<style>
	.button-preview {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem 0.5rem;
		font-size: 0.6875rem;
		font-weight: 500;
		background: color-mix(in srgb, var(--btn-color) 15%, transparent);
		color: var(--btn-color);
		border: 1px solid color-mix(in srgb, var(--btn-color) 30%, transparent);
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.button-preview:hover {
		background: color-mix(in srgb, var(--btn-color) 25%, transparent);
		border-color: color-mix(in srgb, var(--btn-color) 50%, transparent);
	}

	:global(.button-config-popover) {
		width: 280px !important;
		padding: 0 !important;
	}

	.popover-header {
		padding: 0.625rem 0.75rem;
		border-bottom: 1px solid hsl(var(--border));
	}

	.popover-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.popover-content {
		padding: 0.75rem;
	}

	.form-field {
		margin-bottom: 0.75rem;
	}

	.form-field:last-child {
		margin-bottom: 0;
	}

	.form-field :global(label) {
		display: block;
		font-size: 0.6875rem;
		font-weight: 500;
		margin-bottom: 0.25rem;
	}

	.form-field :global(input) {
		height: 2rem;
		font-size: 0.75rem;
	}

	.form-field-switch {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.switch-info {
		flex: 1;
	}

	.switch-info :global(label) {
		font-size: 0.75rem;
		font-weight: 500;
	}

	.switch-description {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.125rem;
	}

	.color-picker {
		display: flex;
		gap: 0.375rem;
		align-items: center;
	}

	.color-input {
		width: 2rem;
		height: 2rem;
		padding: 0.125rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
		cursor: pointer;
		flex-shrink: 0;
	}

	.color-input::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	.color-input::-webkit-color-swatch {
		border: none;
		border-radius: 0.125rem;
	}

	:global(.color-text) {
		flex: 1;
	}
</style>
