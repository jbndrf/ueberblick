<script lang="ts">
	/**
	 * Canonical "button appearance" editor (the L2 presentation of any action
	 * button: connection, stage-form, edit tool, protocol tool). Edits a
	 * VisualConfig via `onChange(patch)`. One control set, reused everywhere a
	 * button is configured — including edit/protocol tools, which had no
	 * appearance UI before.
	 */
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import type { VisualConfig } from '$lib/workflow-builder';
	import {
		propertiesEdgePropertyButtonColor,
		propertiesEdgePropertyButtonLabel,
		propertiesEdgePropertyButtonLabelPlaceholder,
		propertiesEdgePropertyConfirmationDefault,
		propertiesEdgePropertyConfirmationMessage,
		propertiesEdgePropertyRequiresConfirmation,
		propertiesEdgePropertyRequiresConfirmationDesc,
		builderButtonLabelOverrideHint
	} from '$lib/paraglide/messages';

	interface Props {
		visualConfig: VisualConfig | null | undefined;
		onChange: (patch: Partial<VisualConfig>) => void;
		/**
		 * The action's canonical name — shown as the button-label placeholder so
		 * an empty label clearly means "use the action's name". The label here is
		 * a presentation OVERRIDE, not a second name.
		 */
		fallbackLabel?: string;
	}

	let { visualConfig, onChange, fallbackLabel }: Props = $props();

	const vc = $derived(visualConfig ?? {});
</script>

<div class="appearance">
	<div class="form-field">
		<Label for="button-label">{propertiesEdgePropertyButtonLabel?.() ?? 'Button Label'}</Label>
		<Input
			id="button-label"
			value={vc.button_label ?? ''}
			oninput={(e) => onChange({ button_label: e.currentTarget.value })}
			placeholder={fallbackLabel ||
				(propertiesEdgePropertyButtonLabelPlaceholder?.() ?? 'e.g., Submit, Approve, Continue')}
		/>
		<p class="field-hint">
			{builderButtonLabelOverrideHint?.() ?? 'Optional — defaults to the name.'}
		</p>
	</div>

	<div class="form-field">
		<Label for="button-color">{propertiesEdgePropertyButtonColor?.() ?? 'Button Color'}</Label>
		<div class="color-picker">
			<input
				type="color"
				id="button-color"
				value={vc.button_color ?? '#3b82f6'}
				oninput={(e) => onChange({ button_color: e.currentTarget.value })}
				class="color-input"
			/>
			<Input
				value={vc.button_color ?? '#3b82f6'}
				oninput={(e) => onChange({ button_color: e.currentTarget.value })}
				placeholder="#3b82f6"
				class="color-text"
			/>
		</div>
	</div>

	<div class="form-field-switch">
		<div class="switch-info">
			<Label for="requires-confirmation"
				>{propertiesEdgePropertyRequiresConfirmation?.() ?? 'Requires Confirmation'}</Label
			>
			<p class="switch-description">
				{propertiesEdgePropertyRequiresConfirmationDesc?.() ??
					'Show a confirmation dialog before performing this action'}
			</p>
		</div>
		<Switch
			id="requires-confirmation"
			checked={vc.requires_confirmation ?? false}
			onCheckedChange={(checked) => onChange({ requires_confirmation: checked })}
		/>
	</div>

	{#if vc.requires_confirmation}
		<div class="form-field">
			<Label for="confirmation-message"
				>{propertiesEdgePropertyConfirmationMessage?.() ?? 'Confirmation Message'}</Label
			>
			<Input
				id="confirmation-message"
				value={vc.confirmation_message ?? ''}
				oninput={(e) => onChange({ confirmation_message: e.currentTarget.value })}
				placeholder={propertiesEdgePropertyConfirmationDefault?.() ??
					'Are you sure you want to proceed?'}
			/>
		</div>
	{/if}
</div>

<style>
	.appearance {
		display: flex;
		flex-direction: column;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-bottom: 0.625rem;
	}

	.form-field :global(label) {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}

	.field-hint {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		margin-top: -0.125rem;
	}

	.color-picker {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.color-input {
		width: 2.25rem;
		height: 2.25rem;
		padding: 0;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		cursor: pointer;
		background: transparent;
	}

	.form-field-switch {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.625rem;
	}

	.switch-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.switch-description {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}
</style>
