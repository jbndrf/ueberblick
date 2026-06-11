<script lang="ts">
	import { PanelsTopLeft, Code2 } from '@lucide/svelte';
	import { getBuilderContext } from '../builder-context.svelte';
	import { inspectorRegistry } from './registry';
	import EntityYamlView from './EntityYamlView.svelte';
	import type { YamlEntityKind } from '$lib/workflow-builder/transfer';
	import { inspectorViewForm, inspectorViewYaml } from '$lib/paraglide/messages';

	const { state: builderState, ui } = getBuilderContext();

	const entry = $derived(inspectorRegistry[ui.selection.type]);
	const InspectorView = $derived(entry.component);

	// Every selectable entity has a YAML representation. fieldTags is a
	// workflow singleton; fieldDef entries need a concrete id.
	const yamlTarget = $derived.by((): { kind: YamlEntityKind; id: string } | null => {
		const s = ui.selection;
		if (s.type === 'none') return null;
		if (s.type === 'fieldTags') {
			return builderState.getFieldTagForWorkflow() ? { kind: 'fieldTags', id: '' } : null;
		}
		if (!('id' in s) || !s.id) return null;
		return { kind: s.type, id: s.id };
	});

	let showYaml = $state(false);

	// Back to the form view whenever the selection changes.
	$effect(() => {
		void ui.selection;
		showYaml = false;
	});

	const wide = $derived(entry.wide === true && !showYaml);
	const expanded = $derived(ui.selection.type === 'form' && ui.paletteExpanded && !showYaml);
</script>

<aside class="inspector" class:wide class:expanded>
	{#if yamlTarget}
		<div class="mode-toggle">
			<button class="mode-btn" class:active={!showYaml} onclick={() => (showYaml = false)}>
				<PanelsTopLeft class="h-3.5 w-3.5" />
				{inspectorViewForm?.() ?? 'Form'}
			</button>
			<button class="mode-btn" class:active={showYaml} onclick={() => (showYaml = true)}>
				<Code2 class="h-3.5 w-3.5" />
				{inspectorViewYaml?.() ?? 'YAML'}
			</button>
		</div>
	{/if}

	{#if showYaml && yamlTarget}
		<EntityYamlView kind={yamlTarget.kind} entityId={yamlTarget.id} />
	{:else}
		<InspectorView />
	{/if}
</aside>

<style>
	.inspector {
		width: 360px;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		background: oklch(0.965 0.005 250);
		border-left: 1px solid oklch(0.88 0.01 250);
		box-shadow: -2px 0 12px oklch(0 0 0 / 0.06);
		overflow: hidden;
		transition: width 0.2s ease;
	}

	/* Wide mode (~375px mobile width + collapsed palette) */
	.inspector.wide {
		width: 520px;
	}

	/* Expanded mode when the form palette is expanded (+130px for labels) */
	.inspector.wide.expanded {
		width: 650px;
	}

	:global(.dark) .inspector {
		background: hsl(var(--muted));
		border-left-color: oklch(1 0 0 / 20%);
	}

	.mode-toggle {
		display: flex;
		gap: 2px;
		padding: 0.375rem;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--card) / 0.5);
	}

	.mode-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		border: 1px solid transparent;
		background: transparent;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.mode-btn:hover {
		color: hsl(var(--foreground));
	}

	.mode-btn.active {
		background: hsl(var(--accent));
		border-color: hsl(var(--border));
		color: hsl(var(--foreground));
	}
</style>
