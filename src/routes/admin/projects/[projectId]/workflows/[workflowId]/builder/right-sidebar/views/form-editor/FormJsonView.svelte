<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ClipboardCopy, ClipboardPaste, FileJson, Check } from '@lucide/svelte';
	import { z } from 'zod';
	import type { TrackedFormField, ToolsFormField, ToolsForm } from '$lib/workflow-builder';
	import { conditionalLogicSchema } from '$lib/form-engine/conditional-logic';
	import {
		formJsonViewCheatsheetTitle,
		formJsonViewParseError,
		formJsonViewSchemaError,
		formJsonViewApply,
		formJsonViewApplied,
		formJsonViewCopy,
		formJsonViewPaste,
		formJsonViewFormat,
		formJsonViewExampleLabel,
		formJsonViewClickToCopyId,
		formJsonViewMvpNote
	} from '$lib/paraglide/messages';

	type Props = {
		form: ToolsForm;
		fields: TrackedFormField[];
		onFieldUpdate?: (fieldId: string, updates: Partial<ToolsFormField>) => void;
	};

	let { form, fields, onFieldUpdate }: Props = $props();

	const activeFields = $derived(fields.filter((f) => f.status !== 'deleted'));

	function fieldOptionLabels(d: ToolsFormField): string[] {
		const opts = d.field_options as { options?: Array<{ label?: string; value?: string }> } | undefined;
		if (!opts?.options) return [];
		return opts.options.map((o) => o.label ?? o.value ?? '').filter(Boolean);
	}

	const cheatsheet = $derived(
		activeFields.map((f) => ({
			id: f.data.field_def_id ?? f.data.id,
			label: f.data.field_label,
			type: f.data.field_type,
			options: fieldOptionLabels(f.data)
		}))
	);

	function serialize(): string {
		const payload = {
			name: form.name,
			pages: form.pages ?? [],
			fields: activeFields.map((f) => ({
				field_def_id: f.data.field_def_id ?? f.data.id,
				label: f.data.field_label,
				type: f.data.field_type,
				page: f.data.page ?? 1,
				row_index: f.data.row_index,
				column_position: f.data.column_position,
				is_required: f.data.is_required ?? false,
				placeholder: f.data.placeholder ?? null,
				help_text: f.data.help_text ?? null,
				field_options: f.data.field_options ?? null,
				conditional_logic: f.data.conditional_logic ?? null
			}))
		};
		return JSON.stringify(payload, null, 2);
	}

	let json = $state(serialize());
	let parseError = $state<string | null>(null);
	let appliedFlash = $state(false);
	let appliedCount = $state(0);

	// Re-sync when builder state changes externally and the user hasn't started editing.
	let lastSerialized = $state(serialize());
	$effect(() => {
		const fresh = serialize();
		if (json === lastSerialized) {
			json = fresh;
		}
		lastSerialized = fresh;
	});

	const editPayloadSchema = z.object({
		fields: z.array(
			z.object({
				field_def_id: z.string(),
				conditional_logic: conditionalLogicSchema.nullable().optional()
			}).passthrough()
		).optional()
	}).passthrough();

	function format() {
		try {
			const parsed = JSON.parse(json);
			json = JSON.stringify(parsed, null, 2);
			parseError = null;
		} catch (e) {
			parseError = (e as Error).message;
		}
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(json);
		} catch {
			// ignore
		}
	}

	async function paste() {
		try {
			const text = await navigator.clipboard.readText();
			if (text) json = text;
		} catch {
			// ignore
		}
	}

	function copyId(id: string) {
		navigator.clipboard?.writeText(id).catch(() => {});
	}

	function apply() {
		parseError = null;
		let parsed: unknown;
		try {
			parsed = JSON.parse(json);
		} catch (e) {
			parseError = `${formJsonViewParseError?.() ?? 'Invalid JSON'}: ${(e as Error).message}`;
			return;
		}
		const result = editPayloadSchema.safeParse(parsed);
		if (!result.success) {
			parseError = `${formJsonViewSchemaError?.() ?? 'Schema error'}: ${result.error.issues[0]?.message ?? 'invalid shape'}`;
			return;
		}
		const incoming = result.data.fields ?? [];
		let touched = 0;
		for (const incomingField of incoming) {
			const current = activeFields.find(
				(f) => (f.data.field_def_id ?? f.data.id) === incomingField.field_def_id
			);
			if (!current) continue;
			const next = incomingField.conditional_logic ?? null;
			const prev = current.data.conditional_logic ?? null;
			if (JSON.stringify(next) !== JSON.stringify(prev)) {
				onFieldUpdate?.(current.data.id, { conditional_logic: next });
				touched++;
			}
		}
		appliedCount = touched;
		appliedFlash = true;
		setTimeout(() => (appliedFlash = false), 2500);
		if (touched > 0) {
			// Re-sync textarea to canonical serialized state so the user sees the
			// applied conditional_logic reflected back. Defer past the propagation tick.
			setTimeout(() => {
				const fresh = serialize();
				json = fresh;
				lastSerialized = fresh;
			}, 0);
		} else {
			const incomingIds = incoming.map((f) => f.field_def_id);
			const currentIds = activeFields.map((f) => f.data.field_def_id ?? f.data.id);
			const unmatched = incomingIds.filter((id) => !currentIds.includes(id));
			if (incoming.length === 0) {
				parseError =
					'No "fields" array found in JSON. Paste a form payload with fields[].field_def_id + conditional_logic.';
			} else if (unmatched.length === incoming.length) {
				parseError = `0 changes: none of the ${incoming.length} pasted field id(s) match this form. The JSON view only updates conditional_logic on existing fields — it does not import fields across forms. Add the fields in Builder view first, then paste their conditional_logic here using THIS form's ids (see cheatsheet above).`;
			} else {
				parseError = `0 changes: ${incoming.length - unmatched.length} field(s) matched but their conditional_logic was identical to current.`;
			}
		}
	}
</script>

<div class="json-view">
	<div class="cheatsheet">
		<div class="cheatsheet-title">
			{formJsonViewCheatsheetTitle?.() ?? 'Available fields (click id to copy)'}
		</div>
		<ul>
			{#each cheatsheet as f}
				<li>
					<span class="label">{f.label}</span>
					<span class="type">({f.type})</span>
					<button type="button" class="id-pill" title={formJsonViewClickToCopyId?.() ?? 'Copy field id'} onclick={() => copyId(f.id)}>
						{f.id}
					</button>
					{#if f.options.length}
						<span class="options">options: {f.options.join(' | ')}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>

	<details class="example">
		<summary>{formJsonViewExampleLabel?.() ?? 'Example: show field only when Sonderfälle includes ...'}</summary>
		<pre>{`{
  "conditional_logic": {
    "show_if": { "op": "includes", "field": "<paste field id from above>", "value": "stake_missing" }
  }
}`}</pre>
	</details>

	<div class="toolbar">
		<Button variant="ghost" size="sm" onclick={format}>
			<FileJson class="h-4 w-4" />
			{formJsonViewFormat?.() ?? 'Format'}
		</Button>
		<Button variant="ghost" size="sm" onclick={copy}>
			<ClipboardCopy class="h-4 w-4" />
			{formJsonViewCopy?.() ?? 'Copy'}
		</Button>
		<Button variant="ghost" size="sm" onclick={paste}>
			<ClipboardPaste class="h-4 w-4" />
			{formJsonViewPaste?.() ?? 'Paste'}
		</Button>
		<Button variant={appliedFlash ? 'secondary' : 'default'} size="sm" onclick={apply}>
			{#if appliedFlash}
				<Check class="h-4 w-4" />
				{formJsonViewApplied?.() ?? 'Applied'} ({appliedCount})
			{:else}
				{formJsonViewApply?.() ?? 'Apply conditional logic'}
			{/if}
		</Button>
	</div>

	<textarea
		class="json-textarea"
		bind:value={json}
		spellcheck="false"
	></textarea>

	{#if parseError}
		<p class="error">{parseError}</p>
	{/if}

	<p class="note">
		{formJsonViewMvpNote?.() ?? 'Apply writes back only conditional_logic changes. Other edits stay in Builder view.'}
	</p>
</div>

<style>
	.json-view {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		height: 100%;
		padding: 1rem;
		overflow: auto;
	}
	.cheatsheet {
		font-size: 0.8125rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--muted) / 0.3);
	}
	.cheatsheet-title {
		font-weight: 600;
		margin-bottom: 0.25rem;
	}
	.cheatsheet ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.cheatsheet li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.cheatsheet .label { font-weight: 500; }
	.cheatsheet .type { color: hsl(var(--muted-foreground)); }
	.cheatsheet .options { color: hsl(var(--muted-foreground)); font-size: 0.75rem; }
	.id-pill {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		padding: 0.05rem 0.4rem;
		border-radius: 0.25rem;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		cursor: pointer;
	}
	.id-pill:hover { background: hsl(var(--accent)); }
	.example summary {
		cursor: pointer;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}
	.example pre {
		font-size: 0.75rem;
		padding: 0.5rem;
		background: hsl(var(--muted) / 0.3);
		border-radius: 0.25rem;
		margin-top: 0.25rem;
		overflow-x: auto;
	}
	.toolbar {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.json-textarea {
		font-family: ui-monospace, monospace;
		font-size: 0.8125rem;
		min-height: 24rem;
		flex: 1;
		width: 100%;
		padding: 0.75rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		background: hsl(var(--background));
		resize: vertical;
	}
	.error {
		color: hsl(var(--destructive));
		font-size: 0.8125rem;
		margin: 0;
	}
	.note {
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
		margin: 0;
	}
</style>
