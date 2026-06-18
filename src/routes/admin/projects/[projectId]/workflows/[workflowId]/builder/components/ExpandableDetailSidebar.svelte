<script lang="ts">
	/**
	 * Panel 3 — the detail sidebar. The deepest drill-in, reached from Panel 2 via
	 * "go deeper". Distinct panel (not the config sidebar reused). Its header is a
	 * breadcrumb back to Panel 2.
	 */
	import { X, ChevronRight } from '@lucide/svelte';
	import { getBuilderContext } from '../builder-context.svelte';
	import FieldDefinitionEditor from './FieldDefinitionEditor.svelte';
	import { builderDetailBreadcrumbDefinition, commonClose } from '$lib/paraglide/messages';

	const { state: builderState, ui } = getBuilderContext();

	const target = $derived(ui.detailTarget);
	const parentName = $derived.by(() => {
		const t = target;
		if (t?.kind === 'fieldDef') return builderState.getFieldDefById(t.id)?.label ?? '';
		if (t?.kind === 'localField') {
			const form = builderState.getFormById(t.formId)?.data;
			return (form?.local_fields ?? []).find((lf) => lf.key === t.key)?.label ?? '';
		}
		return '';
	});
	const valid = $derived.by(() => {
		const t = target;
		if (!t) return false;
		if (t.kind === 'fieldDef') return !!builderState.getFieldDefById(t.id);
		if (t.kind === 'localField') {
			const form = builderState.getFormById(t.formId)?.data;
			return !!(form?.local_fields ?? []).find((lf) => lf.key === t.key);
		}
		return false;
	});
</script>

{#if target && valid}
	<aside class="detail-sidebar">
		<header class="detail-head">
			<nav class="breadcrumb">
				<button class="crumb crumb-link" onclick={() => (ui.detailTarget = null)}>
					{parentName}
				</button>
				<ChevronRight class="h-3 w-3 shrink-0" />
				<span class="crumb crumb-current">
					{builderDetailBreadcrumbDefinition?.() ?? 'Definition'}
				</span>
			</nav>
			<button
				class="detail-close"
				onclick={() => (ui.detailTarget = null)}
				aria-label={commonClose?.() ?? 'Close'}
			>
				<X class="h-4 w-4" />
			</button>
		</header>
		<div class="detail-body">
			{#if target.kind === 'fieldDef'}
				<FieldDefinitionEditor defId={target.id} />
			{:else if target.kind === 'localField'}
				<FieldDefinitionEditor local={{ formId: target.formId, key: target.key }} />
			{/if}
		</div>
	</aside>
{/if}

<style>
	.detail-sidebar {
		width: 300px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		background: hsl(var(--background));
		border-left: 1px solid oklch(0.88 0.01 250);
		box-shadow: -2px 0 12px oklch(0 0 0 / 0.05);
		overflow: hidden;
	}

	:global(.dark) .detail-sidebar {
		border-left-color: oklch(1 0 0 / 20%);
	}

	.detail-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.4);
		flex-shrink: 0;
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-width: 0;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.crumb {
		max-width: 9rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.crumb-link {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
	}

	.crumb-link:hover {
		color: hsl(var(--foreground));
		text-decoration: underline;
	}

	.crumb-current {
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.detail-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		border-radius: 0.375rem;
		border: none;
		background: transparent;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.detail-close:hover {
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
	}

	.detail-body {
		flex: 1;
		overflow-y: auto;
	}
</style>
