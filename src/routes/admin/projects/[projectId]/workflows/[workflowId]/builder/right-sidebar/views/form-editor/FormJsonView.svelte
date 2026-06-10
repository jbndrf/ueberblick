<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ClipboardCopy, ClipboardPaste, Check, FilePlus } from '@lucide/svelte';
	import { CodeView } from '$lib/components/code-view';
	import type { TrackedFormField, ToolsForm } from '$lib/workflow-builder';
	import {
		buildFormPart,
		stringifyPart,
		parseFormPartText,
		type FormPart,
		type FormImportResult
	} from '$lib/workflow-builder/transfer';
	import {
		formCodeViewHint,
		formCodeViewImport,
		formCodeViewImported,
		formCodeViewInvalid,
		formCodeViewCopyForm,
		formCodeViewPasteForm
	} from '$lib/paraglide/messages';

	type Props = {
		form: ToolsForm;
		fields: TrackedFormField[];
		/** Create a NEW form from a pasted/edited definition. Returns the result so
		 *  we can surface the imported-field count and any warnings. */
		onImportForm?: (part: FormPart) => FormImportResult | undefined;
	};

	let { form, fields, onImportForm }: Props = $props();

	const activeFields = $derived(fields.filter((f) => f.status !== 'deleted'));

	/** Serialize the current form to a label-based YAML `form` part. */
	function serialize(): string {
		const part = buildFormPart(
			form,
			activeFields.map((f) => f.data)
		);
		return stringifyPart(part);
	}

	let code = $state(serialize());
	let parseError = $state<string | null>(null);
	let flash = $state<{ count: number; warnings: number } | null>(null);

	// Re-sync from builder state when the form changes externally and the user
	// hasn't started editing the text.
	let lastSerialized = $state(serialize());
	$effect(() => {
		const fresh = serialize();
		if (code === lastSerialized) code = fresh;
		lastSerialized = fresh;
	});

	async function copyForm() {
		try {
			await navigator.clipboard.writeText(code);
		} catch {
			// ignore
		}
	}

	async function pasteForm() {
		try {
			const text = await navigator.clipboard.readText();
			if (text) code = text;
		} catch {
			// ignore
		}
	}

	function importAsNew() {
		parseError = null;
		flash = null;
		let part: FormPart;
		try {
			part = parseFormPartText(code);
		} catch (e) {
			parseError = `${formCodeViewInvalid()}: ${(e as Error).message}`;
			return;
		}
		const result = onImportForm?.(part);
		if (result) {
			flash = { count: result.created, warnings: result.warnings.length };
			setTimeout(() => (flash = null), 4000);
		}
	}
</script>

<div class="code-form-view">
	<p class="hint">{formCodeViewHint()}</p>

	<div class="toolbar">
		<Button variant="ghost" size="sm" onclick={copyForm}>
			<ClipboardCopy class="h-4 w-4" />
			{formCodeViewCopyForm()}
		</Button>
		<Button variant="ghost" size="sm" onclick={pasteForm}>
			<ClipboardPaste class="h-4 w-4" />
			{formCodeViewPasteForm()}
		</Button>
		<Button variant={flash ? 'secondary' : 'default'} size="sm" onclick={importAsNew}>
			{#if flash}
				<Check class="h-4 w-4" />
				{formCodeViewImported()} ({flash.count})
			{:else}
				<FilePlus class="h-4 w-4" />
				{formCodeViewImport()}
			{/if}
		</Button>
	</div>

	<div class="editor-wrap">
		<CodeView bind:value={code} hideCopy />
	</div>

	{#if parseError}
		<p class="error">{parseError}</p>
	{/if}
	{#if flash && flash.warnings > 0}
		<p class="warn">
			⚠ {flash.warnings} warning(s) — some references could not be resolved and were dropped.
		</p>
	{/if}
</div>

<style>
	.code-form-view {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		height: 100%;
		padding: 0.75rem;
		overflow: hidden;
	}
	.hint {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}
	.toolbar {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.editor-wrap {
		flex: 1;
		min-height: 0;
	}
	.error {
		color: hsl(var(--destructive));
		font-size: 0.8125rem;
		margin: 0;
	}
	.warn {
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
		margin: 0;
	}
</style>
