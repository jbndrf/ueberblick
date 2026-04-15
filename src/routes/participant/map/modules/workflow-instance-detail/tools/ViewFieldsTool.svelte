<script lang="ts">
	/**
	 * ViewFieldsTool
	 *
	 * Shows collected field values in read-only mode using FormRenderer.
	 * Used within the workflow instance detail module's Details tab.
	 */
	import { FormRenderer, type FormFieldWithValue } from '$lib/components/form-renderer';
	import * as m from '$lib/paraglide/messages';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		/** Fields to display (with values) */
		fields: FormFieldWithValue[];
		/** Optional page title override */
		title?: string;
		/** Show pagination controls (default: false) */
		paginated?: boolean;
	}

	let { fields, title, paginated = false }: Props = $props();

	// ==========================================================================
	// State
	// ==========================================================================

	let currentPage = $state(1);

	// ==========================================================================
	// Handlers
	// ==========================================================================

	function handlePageChange(page: number) {
		currentPage = page;
	}
</script>

{#if fields.length > 0}
	<div class="space-y-4">
		{#if title}
			<h4 class="text-sm font-semibold text-foreground border-b border-border pb-2">
				{title}
			</h4>
		{/if}

		<FormRenderer
			mode="view"
			{fields}
			{paginated}
			{currentPage}
			onPageChange={handlePageChange}
		/>
	</div>
{:else}
	<div class="text-center py-8 text-muted-foreground">
		<p class="text-sm">{m.participantViewFieldsToolNoData?.() ?? 'No data collected'}</p>
	</div>
{/if}
