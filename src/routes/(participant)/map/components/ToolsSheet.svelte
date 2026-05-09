<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Badge } from '$lib/components/ui/badge';
	import { MessageSquare } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		chatAvailable: boolean;
		chatSoft: boolean;
		chatHard: number;
		onOpenChat: () => void;
	}

	let {
		open = $bindable(),
		chatAvailable,
		chatSoft,
		chatHard,
		onOpenChat,
	}: Props = $props();

	function handleOpenChat() {
		open = false;
		onOpenChat();
	}
</script>

<Sheet.Root bind:open>
	<Sheet.ContentNoOverlay side="right" class="w-28 md:w-32 p-0 gap-0">
		<Sheet.Header class="border-b p-2">
			<Sheet.Title class="text-sm">{m.participantToolsSheetTitle?.() ?? 'Tools'}</Sheet.Title>
		</Sheet.Header>

		<div class="flex flex-col gap-2 p-2">
			{#if chatAvailable}
				<button
					type="button"
					onclick={handleOpenChat}
					class="relative flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border bg-card p-1 text-center transition-colors hover:bg-muted active:scale-[0.98]"
				>
					<div class="relative flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
						<MessageSquare class="h-4 w-4" />
						{#if chatSoft && chatHard === 0}
							<span class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-muted-foreground"></span>
						{/if}
					</div>
					<span class="text-[0.625rem] font-medium leading-tight">
						{m.participantToolsChatLabel?.() ?? 'Chat'}
					</span>
					{#if chatHard > 0}
						<Badge variant="destructive" class="absolute right-1 top-1 h-4 min-w-4 px-1 text-[0.5625rem]">
							{chatHard > 99 ? '99+' : chatHard}
						</Badge>
					{/if}
				</button>
			{:else}
				<div class="rounded-lg border border-dashed p-2 text-center text-[0.625rem] text-muted-foreground">
					{m.participantToolsEmpty?.() ?? 'No tools active.'}
				</div>
			{/if}
		</div>
	</Sheet.ContentNoOverlay>
</Sheet.Root>
