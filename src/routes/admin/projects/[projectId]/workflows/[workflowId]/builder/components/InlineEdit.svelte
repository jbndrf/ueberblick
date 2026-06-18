<script lang="ts">
	/**
	 * Canonical "rename in place" control for the builder.
	 *
	 * Shows `value` as clickable text; clicking turns it into an input. Commits on
	 * blur or Enter, cancels on Escape. The same `class` is applied to the display
	 * button and the input so the field keeps its heading/title styling in either
	 * state. This is the ONE rename affordance — no pencil-icon-first, no separate
	 * always-visible input.
	 */
	interface Props {
		value: string;
		onCommit: (value: string) => void;
		placeholder?: string;
		/** Applied to both the display button and the edit input. */
		class?: string;
		ariaLabel?: string;
		/** Tooltip on the display button (e.g. "Click to rename"). */
		editTitle?: string;
		/** Allow committing an empty value (default false → empty reverts). */
		allowEmpty?: boolean;
	}

	let {
		value,
		onCommit,
		placeholder = '',
		class: className = '',
		ariaLabel,
		editTitle,
		allowEmpty = false
	}: Props = $props();

	let editing = $state(false);
	let draft = $state(value);
	let inputEl = $state<HTMLInputElement | null>(null);

	// Keep the draft in sync when the value changes from outside while not editing.
	$effect(() => {
		if (!editing) draft = value;
	});

	// Focus + select on entering edit mode.
	$effect(() => {
		if (editing && inputEl) {
			inputEl.focus();
			inputEl.select();
		}
	});

	function start() {
		draft = value;
		editing = true;
	}

	function commit() {
		editing = false;
		const trimmed = draft.trim();
		if ((trimmed || allowEmpty) && trimmed !== value) onCommit(trimmed);
		else draft = value;
	}

	function cancel() {
		draft = value;
		editing = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			(e.target as HTMLInputElement).blur();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		}
	}
</script>

{#if editing}
	<input
		bind:this={inputEl}
		class={className}
		bind:value={draft}
		onblur={commit}
		onkeydown={onKeydown}
		{placeholder}
		aria-label={ariaLabel}
	/>
{:else}
	<button type="button" class={className} onclick={start} title={editTitle} aria-label={ariaLabel}>
		{value || placeholder}
	</button>
{/if}
