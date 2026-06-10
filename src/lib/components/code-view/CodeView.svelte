<!--
	CodeView — a CodeMirror 6 editor for viewing/editing structured config as
	YAML (or JSON). Syntax highlighting + code folding (collapsible sections,
	IDE-style) + an optional read-only mode and a copy button.

	Used for the workflow builder's "code view" surfaces (form / field-def /
	stage-skeleton / whole-workflow). Format-agnostic: it just edits text — the
	transfer layer handles (de)serialization.
-->
<script lang="ts">
	import { EditorView, basicSetup } from 'codemirror';
	import { EditorState, Compartment } from '@codemirror/state';
	import { keymap } from '@codemirror/view';
	import { indentWithTab } from '@codemirror/commands';
	import { yaml } from '@codemirror/lang-yaml';
	import { Button } from '$lib/components/ui/button';
	import { ClipboardCopy, Check } from '@lucide/svelte';

	type Props = {
		value: string;
		readOnly?: boolean;
		/** Hide the built-in copy button (e.g. when the parent supplies its own). */
		hideCopy?: boolean;
		onChange?: (value: string) => void;
		class?: string;
	};

	let {
		value = $bindable(''),
		readOnly = false,
		hideCopy = false,
		onChange,
		class: className = ''
	}: Props = $props();

	let view: EditorView | undefined;
	let copied = $state(false);
	const editableComp = new Compartment();

	// Guard so the updateListener doesn't echo programmatic value changes back
	// out through onChange / bindable value.
	let applyingExternal = false;

	function mount(node: HTMLDivElement) {
		view = new EditorView({
			parent: node,
			state: EditorState.create({
				doc: value,
				extensions: [
					basicSetup,
					yaml(),
					keymap.of([indentWithTab]),
					editableComp.of(EditorView.editable.of(!readOnly)),
					EditorView.theme({
						'&': { fontSize: '0.8125rem', height: '100%' },
						'.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
						'&.cm-focused': { outline: 'none' }
					}),
					EditorView.updateListener.of((u) => {
						if (!u.docChanged || applyingExternal) return;
						const next = u.state.doc.toString();
						value = next;
						onChange?.(next);
					})
				]
			})
		});
		return {
			destroy() {
				view?.destroy();
				view = undefined;
			}
		};
	}

	// Push external `value` changes into the editor (without looping back out).
	$effect(() => {
		const incoming = value;
		if (!view) return;
		if (incoming === view.state.doc.toString()) return;
		applyingExternal = true;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: incoming }
		});
		applyingExternal = false;
	});

	// Reconfigure editability when `readOnly` toggles.
	$effect(() => {
		view?.dispatch({
			effects: editableComp.reconfigure(EditorView.editable.of(!readOnly))
		});
	});

	async function copy() {
		try {
			await navigator.clipboard.writeText(view?.state.doc.toString() ?? value);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// clipboard unavailable — ignore
		}
	}
</script>

<div class="code-view {className}">
	{#if !hideCopy}
		<div class="code-view-toolbar">
			<Button variant="ghost" size="sm" onclick={copy} type="button">
				{#if copied}
					<Check class="h-4 w-4" />
				{:else}
					<ClipboardCopy class="h-4 w-4" />
				{/if}
			</Button>
		</div>
	{/if}
	<div class="code-view-editor" use:mount></div>
</div>

<style>
	.code-view {
		position: relative;
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		overflow: hidden;
		background: hsl(var(--background));
	}
	.code-view-toolbar {
		position: absolute;
		top: 0.25rem;
		right: 0.25rem;
		z-index: 2;
	}
	.code-view-editor {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	/* CodeMirror fold gutter / active line tint follow the app surface. */
	.code-view :global(.cm-gutters) {
		background: hsl(var(--muted) / 0.4);
		border-right: 1px solid hsl(var(--border));
		color: hsl(var(--muted-foreground));
	}
	.code-view :global(.cm-activeLineGutter),
	.code-view :global(.cm-activeLine) {
		background: hsl(var(--accent) / 0.4);
	}
	.code-view :global(.cm-foldPlaceholder) {
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		color: hsl(var(--muted-foreground));
		border-radius: 0.25rem;
		padding: 0 0.35rem;
	}
</style>
