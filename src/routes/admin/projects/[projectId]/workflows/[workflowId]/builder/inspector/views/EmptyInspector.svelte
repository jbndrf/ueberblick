<script lang="ts">
	import { MousePointerClick } from '@lucide/svelte';
	import { inspectorEmptyHint } from '$lib/paraglide/messages';
</script>

<div class="empty">
	<MousePointerClick class="h-6 w-6 text-muted-foreground" />
	<p>
		{inspectorEmptyHint?.() ??
			'Select a stage, connection or tool to configure it here.'}
	</p>
</div>

<style>
	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 2rem;
		text-align: center;
	}

	.empty p {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		max-width: 220px;
	}
</style>
