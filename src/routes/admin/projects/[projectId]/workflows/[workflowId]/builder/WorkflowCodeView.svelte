<!--
	Whole-workflow YAML view (Home-Assistant style). Serializes the entire builder
	model to label/key-based YAML, lets the user edit it, and applies changes back
	onto the in-memory builder (bidirectional). Apply does NOT save — the user
	reviews the canvas and clicks Save, so a bad edit is undone by reloading.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Check, RefreshCw, FileWarning } from '@lucide/svelte';
	import { CodeView } from '$lib/components/code-view';
	import type { WorkflowBuilderState } from '$lib/workflow-builder';
	import {
		buildWorkflowPart,
		applyWorkflowPart,
		stringifyPart,
		parseWorkflowPartText,
		type Role
	} from '$lib/workflow-builder/transfer';
	import {
		workflowCodeHint,
		workflowCodeApply,
		workflowCodeApplied,
		workflowCodeReload,
		workflowCodeInvalid,
		formCodeViewCopyForm
	} from '$lib/paraglide/messages';

	type Props = { builderState: WorkflowBuilderState; roles?: Role[] };
	let { builderState, roles = [] }: Props = $props();

	function serialize(): string {
		return stringifyPart(buildWorkflowPart(builderState, { roles }));
	}

	let code = $state(serialize());
	let error = $state<string | null>(null);
	let result = $state<{ warnings: string[] } | null>(null);

	function reload() {
		code = serialize();
		error = null;
		result = null;
	}

	function apply() {
		error = null;
		result = null;
		try {
			const part = parseWorkflowPartText(code);
			result = applyWorkflowPart(builderState, part, { roles });
			// Reflect the canonical serialization back (ids resolved, keys normalized).
			code = serialize();
		} catch (e) {
			error = `${workflowCodeInvalid()}: ${(e as Error).message}`;
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

<div class="workflow-code">
	<div class="bar">
		<p class="hint">{workflowCodeHint()}</p>
		<div class="actions">
			<Button variant="ghost" size="sm" onclick={copy}>{formCodeViewCopyForm()}</Button>
			<Button variant="ghost" size="sm" onclick={reload}>
				<RefreshCw class="mr-1 h-4 w-4" />
				{workflowCodeReload()}
			</Button>
			<Button variant="default" size="sm" onclick={apply}>{workflowCodeApply()}</Button>
		</div>
	</div>

	{#if error}
		<p class="msg error"><FileWarning class="h-4 w-4" /> {error}</p>
	{:else if result}
		<p class="msg ok">
			<Check class="h-4 w-4" />
			{workflowCodeApplied()}{result.warnings.length
				? ` — ${result.warnings.length} warning(s)`
				: ''}
		</p>
		{#if result.warnings.length}
			<ul class="warnings">
				{#each result.warnings as w, i (i)}
					<li>{w}</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<div class="editor">
		<CodeView bind:value={code} hideCopy />
	</div>
</div>

<style>
	.workflow-code {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		height: 100%;
		min-height: 0;
		padding: 0.75rem 1rem;
		overflow: hidden;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.hint {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
		max-width: 60ch;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	.msg {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		margin: 0;
	}
	.msg.error {
		color: hsl(var(--destructive));
	}
	.msg.ok {
		color: hsl(var(--muted-foreground));
	}
	.warnings {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		max-height: 6rem;
		overflow: auto;
	}
	.editor {
		flex: 1;
		min-height: 0;
	}
</style>
