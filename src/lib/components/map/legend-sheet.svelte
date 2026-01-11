<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Badge } from '$lib/components/ui/badge';
	import * as m from '$lib/paraglide/messages';

	interface LegendItem {
		id: string;
		name: string;
		color: string;
		icon?: string;
		count?: number;
	}

	interface Props {
		open: boolean;
		onClose?: () => void;
		items?: LegendItem[];
	}

	let { open = $bindable(), onClose, items = [] }: Props = $props();

	function handleClose() {
		open = false;
		onClose?.();
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="left" class="w-80">
		<Sheet.Header>
			<Sheet.Title>Map Legend</Sheet.Title>
			<Sheet.Description>View marker categories and symbols</Sheet.Description>
		</Sheet.Header>

		<div class="space-y-3 py-6">
			{#if items.length > 0}
				{#each items as item}
					<div class="flex items-center gap-3 rounded-lg border p-3">
						<div
							class="h-8 w-8 shrink-0 rounded-full"
							style="background-color: {item.color}"
						></div>
						<div class="min-w-0 flex-1">
							<div class="font-medium">{item.name}</div>
							{#if item.count !== undefined}
								<div class="text-xs text-muted-foreground">{item.count} markers</div>
							{/if}
						</div>
					</div>
				{/each}
			{:else}
				<div class="py-8 text-center text-sm text-muted-foreground">
					No legend items available
				</div>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
