<!--
	Per-entity YAML editor — the inspector's code toggle. Shows the selected
	entity (incl. its children: form fields, sentry clauses, automation steps)
	as label/key-based YAML; Apply patches the in-memory builder state through
	the same reconcile path as the whole-workflow code view. Apply does NOT
	save — the user reviews and clicks Save.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Check, RefreshCw, FileWarning } from '@lucide/svelte';
	import { CodeView } from '$lib/components/code-view';
	import {
		serializeEntityPart,
		applyEntityPart,
		type YamlEntityKind
	} from '$lib/workflow-builder/transfer';
	import { getBuilderContext } from '../builder-context.svelte';
	import {
		entityYamlHint,
		workflowCodeApply,
		workflowCodeApplied,
		workflowCodeReload,
		formCodeViewCopyForm
	} from '$lib/paraglide/messages';

	type Props = { kind: YamlEntityKind; entityId: string };
	let { kind, entityId }: Props = $props();

	const { state: builderState, roles } = getBuilderContext();

	function serialize(): string {
		return serializeEntityPart(builderState, roles, kind, entityId)?.text ?? '';
	}

	let code = $state('');
	let errors = $state<string[]>([]);
	let warnings = $state<string[] | null>(null);

	// Re-serialize when the selected entity changes.
	$effect(() => {
		void kind;
		void entityId;
		code = serialize();
		errors = [];
		warnings = null;
	});

	function reload() {
		code = serialize();
		errors = [];
		warnings = null;
	}

	function apply() {
		const result = applyEntityPart(builderState, roles, kind, entityId, code);
		errors = result.errors;
		warnings = result.errors.length === 0 ? result.warnings : null;
		if (result.errors.length === 0) {
			// Reflect the canonical serialization back (keys normalized).
			code = serialize();
		}
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(code);
		} catch {
			// ignore
		}
	}
</script>

<div class="entity-yaml">
	<div class="bar">
		<p class="hint">{entityYamlHint?.() ?? 'YAML of this element (including its children).'}</p>
		<div class="actions">
			<Button variant="ghost" size="sm" onclick={copy}>{formCodeViewCopyForm()}</Button>
			<Button variant="ghost" size="sm" onclick={reload}>
				<RefreshCw class="mr-1 h-4 w-4" />
				{workflowCodeReload()}
			</Button>
			<Button variant="default" size="sm" onclick={apply}>{workflowCodeApply()}</Button>
		</div>
	</div>

	{#if errors.length > 0}
		<div class="messages error">
			<FileWarning class="h-4 w-4 shrink-0" />
			<ul>
				{#each errors as e}<li>{e}</li>{/each}
			</ul>
		</div>
	{:else if warnings !== null}
		<div class="messages ok">
			<Check class="h-4 w-4 shrink-0" />
			<span>{workflowCodeApplied()}</span>
			{#if warnings.length > 0}
				<ul>
					{#each warnings as w}<li>{w}</li>{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<div class="editor">
		<CodeView bind:value={code} hideCopy />
	</div>
</div>

<style>
	.entity-yaml {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid hsl(var(--border));
	}

	.hint {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.messages {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem;
	}

	.messages.error {
		color: hsl(var(--destructive));
		background: hsl(var(--destructive) / 0.08);
	}

	.messages.ok {
		color: hsl(142 71% 30%);
		background: hsl(142 76% 95%);
	}

	.messages ul {
		margin: 0;
		padding-left: 1rem;
	}

	.editor {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
</style>
