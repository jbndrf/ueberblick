<script lang="ts">
	import {
		FormInput,
		Asterisk,
		CircleHelp,
		Eye,
		EyeOff,
		ArrowUp,
		ArrowDown,
		Copy,
		Trash2,
		Pencil
	} from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';
	import ToolSection from '../shared/ToolSection.svelte';
	import ToolButton from '../shared/ToolButton.svelte';
	import type { SelectionContext } from '../context';

	type Props = {
		context: Extract<SelectionContext, { type: 'field' }>;
		onToggleRequired: () => void;
		onMoveUp: () => void;
		onMoveDown: () => void;
		onDuplicate: () => void;
		onEditField: () => void;
		onDeleteField: () => void;
	};

	let { context, onToggleRequired, onMoveUp, onMoveDown, onDuplicate, onEditField, onDeleteField }: Props = $props();
</script>

<div class="panel">
	<div class="panel-header bg-muted border-b border-border">
		<FormInput class="panel-header-icon text-muted-foreground" />
		<div class="panel-header-text">
			<span class="panel-header-title text-foreground">{context.field.fieldLabel}</span>
			<span class="panel-header-subtitle text-muted-foreground">{context.field.fieldType.replace('_', ' ')}</span>
		</div>
	</div>

	<ToolSection title={m.workflowBuilderFieldPanelFieldOptions?.() ?? 'Field Options'}>
		<div class="tool-grid">
			<ToolButton
				label={context.field.isRequired ? (m.workflowBuilderFieldPanelRequired?.() ?? 'Required') : (m.workflowBuilderFieldPanelOptional?.() ?? 'Optional')}
				description={m.workflowBuilderFieldPanelToggleRequirement?.() ?? 'Toggle requirement'}
				icon={Asterisk}
				variant={context.field.isRequired ? 'primary' : 'default'}
				onclick={onToggleRequired}
			/>
			<ToolButton
				label={m.workflowBuilderFieldPanelAddHelpText?.() ?? 'Add Help Text'}
				description={m.workflowBuilderFieldPanelInstructionsForUsers?.() ?? 'Instructions for users'}
				icon={CircleHelp}
				variant="muted"
			/>
		</div>
	</ToolSection>

	<ToolSection title={m.workflowBuilderFieldPanelConditionalLogic?.() ?? 'Conditional Logic'} defaultOpen={false}>
		<div class="tool-grid">
			<ToolButton
				label={m.workflowBuilderFieldPanelShowWhen?.() ?? 'Show When...'}
				description={m.workflowBuilderFieldPanelConditionalVisibility?.() ?? 'Conditional visibility'}
				icon={Eye}
				variant="muted"
			/>
			<ToolButton
				label={m.workflowBuilderFieldPanelHideWhen?.() ?? 'Hide When...'}
				description={m.workflowBuilderFieldPanelConditionalHiding?.() ?? 'Conditional hiding'}
				icon={EyeOff}
				variant="muted"
			/>
		</div>
	</ToolSection>

	<ToolSection title={m.workflowBuilderFieldPanelFieldActions?.() ?? 'Field Actions'} defaultOpen={false}>
		<div class="tool-grid">
			<ToolButton label={m.workflowBuilderFieldPanelMoveUp?.() ?? 'Move Up'} icon={ArrowUp} variant="muted" onclick={onMoveUp} />
			<ToolButton label={m.workflowBuilderFieldPanelMoveDown?.() ?? 'Move Down'} icon={ArrowDown} variant="muted" onclick={onMoveDown} />
			<ToolButton label={m.workflowBuilderFieldPanelDuplicate?.() ?? 'Duplicate'} icon={Copy} variant="muted" onclick={onDuplicate} />
			<ToolButton label={m.workflowBuilderFieldPanelEditField?.() ?? 'Edit Field'} icon={Pencil} variant="muted" onclick={onEditField} />
			<ToolButton label={m.workflowBuilderFieldPanelDeleteField?.() ?? 'Delete Field'} icon={Trash2} variant="muted" onclick={onDeleteField} />
		</div>
	</ToolSection>
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.125rem;
		background: hsl(var(--muted));
		border-bottom: 1px solid hsl(var(--border));
	}

	.panel-header :global(.panel-header-icon) {
		width: 1.25rem;
		height: 1.25rem;
		color: hsl(var(--muted-foreground));
	}

	.panel-header-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.panel-header-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.panel-header-subtitle {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-transform: capitalize;
	}

	.tool-grid {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
</style>
