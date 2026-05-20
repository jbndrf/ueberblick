<script lang="ts">
	import { ExternalLink, Link2, AlertCircle } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';

	type Props = {
		/** Parsed value: string id, array of ids, or undefined. */
		value: unknown;
		/** field_options.target_workflow_id, may be null = any workflow. */
		targetWorkflowId?: string | null;
		/** field_options.relation_kind. */
		relationKind?: 'peer' | 'parent' | 'child';
		/** Read-only view rendering. Edit-mode picker is rendered separately. */
		mode: 'view' | 'edit';
	};

	let { value, targetWorkflowId, relationKind = 'peer', mode }: Props = $props();

	type Linked = {
		id: string;
		name: string;
		workflowName?: string;
		missing?: boolean;
	};

	let linked = $state<Linked[]>([]);
	let loading = $state(false);

	const ids = $derived.by((): string[] => {
		if (!value) return [];
		if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
		if (typeof value === 'string' && value.length > 0) {
			// Tolerate JSON-string or comma-separated or single id.
			if (value.startsWith('[')) {
				try {
					const parsed = JSON.parse(value);
					if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
				} catch {
					/* fall through */
				}
			}
			return [value];
		}
		return [];
	});

	onMount(async () => {
		if (ids.length === 0) return;
		loading = true;
		try {
			const gateway = getParticipantGateway();
			if (!gateway) {
				linked = ids.map((id) => ({ id, name: id, missing: true }));
				return;
			}
			const filter = ids.map((id) => `id = "${id}"`).join(' || ');
			const rows = await gateway.collection('workflow_instances').getFullList({
				filter,
				fields: 'id, name, workflow_id'
			}) as Array<Record<string, any>>;

			let workflowName: string | undefined;
			if (targetWorkflowId) {
				try {
					const wf = await gateway.collection('workflows').getOne(targetWorkflowId, { fields: 'name' });
					workflowName = (wf as any).name as string;
				} catch {
					/* ignore */
				}
			}

			const byId = new Map(rows.map((r) => [r.id as string, r]));
			linked = ids.map((id) => {
				const row = byId.get(id);
				if (!row) return { id, name: id, missing: true };
				return {
					id,
					name: (row.name as string) || id,
					workflowName: workflowName ?? '',
					missing: false
				};
			});
		} catch {
			linked = ids.map((id) => ({ id, name: id, missing: true }));
		} finally {
			loading = false;
		}
	});

	function navigateTo(id: string) {
		// Lightweight: dispatch a custom event so the host page can route.
		// We don't import SvelteKit's goto here to keep the renderer pure.
		const ev = new CustomEvent('instance-reference-open', { detail: { instanceId: id }, bubbles: true });
		document.dispatchEvent(ev);
	}
</script>

{#if mode === 'view'}
	{#if ids.length === 0}
		<div class="empty">No reference</div>
	{:else if loading}
		<div class="empty">Loading…</div>
	{:else}
		<ul class="card-list" class:nested={relationKind === 'child'}>
			{#each linked as item (item.id)}
				<li>
					<button type="button" class="card" class:missing={item.missing} onclick={() => !item.missing && navigateTo(item.id)}>
						<div class="card-icon">
							{#if item.missing}
								<AlertCircle class="h-4 w-4" />
							{:else}
								<Link2 class="h-4 w-4" />
							{/if}
						</div>
						<div class="card-body">
							<div class="card-name">{item.name}</div>
							<div class="card-meta">
								{#if item.missing}
									<span class="missing-label">Missing or no access</span>
								{:else if item.workflowName}
									{item.workflowName}
								{:else}
									Linked case
								{/if}
							</div>
						</div>
						{#if !item.missing}
							<ExternalLink class="h-3.5 w-3.5 card-chevron" />
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
{:else}
	<!-- Edit mode: minimal placeholder. A real picker modal lands later;
	     for now show the linked items with a hint that editing is read-only. -->
	<div class="edit-placeholder">
		{#if ids.length === 0}
			<span class="edit-hint">Instance references are linked via automations or admin tooling for now.</span>
		{:else}
			<ul class="card-list">
				{#each linked as item (item.id)}
					<li><div class="card readonly">{item.name}</div></li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<style>
	.empty {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--muted) / 0.4);
		border-radius: 0.375rem;
	}

	.card-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card-list.nested {
		padding-left: 0.75rem;
		border-left: 2px solid hsl(var(--border));
	}

	.card {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.625rem 0.75rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		cursor: pointer;
		width: 100%;
		text-align: left;
		transition: background 0.1s ease, border-color 0.1s ease;
	}

	.card:hover:not(.missing):not(.readonly) {
		background: hsl(var(--accent));
		border-color: hsl(var(--primary) / 0.4);
	}

	.card.readonly {
		cursor: default;
	}

	.card.missing {
		background: hsl(var(--destructive) / 0.05);
		border-color: hsl(var(--destructive) / 0.3);
		cursor: not-allowed;
	}

	.card-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
		border-radius: 0.25rem;
	}

	.card.missing .card-icon {
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
	}

	.card-body {
		flex: 1;
		min-width: 0;
	}

	.card-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-meta {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.missing-label {
		color: hsl(var(--destructive));
	}

	.card-chevron {
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.edit-placeholder {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.edit-hint {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--muted) / 0.4);
		border-radius: 0.375rem;
	}
</style>
