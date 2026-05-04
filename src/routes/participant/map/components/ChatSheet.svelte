<script lang="ts">
	import { tick, onMount } from 'svelte';
	import { Loader2, X } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';
	import MessageList from '$lib/chat/MessageList.svelte';
	import Composer from '$lib/chat/Composer.svelte';
	import { createMentionableStore } from '$lib/chat/mentionable.svelte';
	import { extractMentionIds } from '$lib/chat/mentions';
	import type { ChatUnreadStore } from '$lib/chat/unread-store.svelte';
	import type { ParticipantGateway } from '$lib/participant-state/gateway.svelte';

	// Portal action -- moves the node to document.body. Same pattern as
	// mobile-multi-select.svelte / WorkflowSelector. Avoids the body-wide
	// pointer-events lock bits-ui Dialog applies in modal mode (which broke
	// interaction with the rest of the page on desktop) and any ancestor
	// stacking context limits.
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	interface Props {
		open: boolean;
		gateway: ParticipantGateway | null;
		projectId: string;
		participantId: string;
		isMember: boolean;
		unreadStore: ChatUnreadStore | null;
	}

	let {
		open = $bindable(),
		gateway,
		projectId,
		participantId,
		isMember,
		unreadStore,
	}: Props = $props();

	let mentionables = $state<ReturnType<typeof createMentionableStore> | null>(null);
	let scrollerEl: HTMLDivElement | null = $state(null);

	// Keyboard responsiveness: track visualViewport so the sheet shrinks when
	// the on-screen keyboard appears, keeping the composer pinned visible.
	// Same pattern as `mobile-multi-select.svelte`.
	let viewportHeight = $state(0);

	onMount(() => {
		function update() {
			viewportHeight = window.visualViewport?.height ?? window.innerHeight;
		}
		update();
		window.visualViewport?.addEventListener('resize', update);
		window.addEventListener('resize', update);
		return () => {
			window.visualViewport?.removeEventListener('resize', update);
			window.removeEventListener('resize', update);
		};
	});

	$effect(() => {
		if (open && isMember && projectId && !mentionables) {
			mentionables = createMentionableStore(projectId);
		}
	});

	// Pin the scroll to the bottom whenever the message list grows, the sheet
	// opens, or the scroller mounts. Reads message count + latest timestamp +
	// scrollerEl so any of those changing re-runs the effect.
	$effect(() => {
		if (!open || !unreadStore || !scrollerEl) return;
		const _len = unreadStore.messages.length;
		const _latest = unreadStore.latestMessageAt;
		const _vh = viewportHeight;
		void _len;
		void _latest;
		void _vh;
		const el = scrollerEl;
		tick().then(() => {
			el.scrollTop = el.scrollHeight;
		});
	});

	// Mark read separately so a slow PocketBase round-trip can't delay scrolling.
	$effect(() => {
		if (!open || !unreadStore) return;
		const _latest = unreadStore.latestMessageAt;
		void _latest;
		unreadStore.markAllRead().catch((e) => console.warn('chat: markAllRead failed', e));
	});

	async function handleSubmit(body: string) {
		if (!gateway) return;
		const ids = extractMentionIds(body);
		await gateway.collection('chat_messages').create({
			project_id: projectId,
			author_id: participantId,
			body,
			mentions: ids,
		});
	}
</script>

{#if open}
	<div use:portal class="chat-sheet-portal">
		<!-- Right-edge sidebar. Full-width on mobile (with visualViewport-driven
		     height so the keyboard doesn't push the composer off-screen),
		     fixed-width sidebar on desktop. No backdrop overlay -- map and
		     surrounding UI stay interactive. -->
		<aside
			class="fixed right-0 top-0 z-[9999] flex flex-col border-l bg-background shadow-xl
				w-full md:w-96"
			style={viewportHeight > 0 ? `height: ${viewportHeight}px;` : 'height: 100vh;'}
			role="dialog"
			aria-modal="false"
			aria-label={m.participantChatTitle?.() ?? 'Project chat'}
		>
			<header class="h-12 shrink-0 flex flex-row items-center justify-between gap-2 border-b px-3">
				<h2 class="text-base font-semibold">
					{m.participantChatTitle?.() ?? 'Project chat'}
				</h2>
				<button
					type="button"
					onclick={() => (open = false)}
					class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					aria-label="Close"
				>
					<X class="h-4 w-4" />
				</button>
			</header>

			{#if !gateway}
				<div class="flex flex-1 items-center justify-center">
					<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
				</div>
			{:else if !isMember}
				<div class="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
					{m.participantChatNotMember?.() ?? 'Project chat is not available for your role.'}
				</div>
			{:else if mentionables && unreadStore}
				<div bind:this={scrollerEl} class="min-h-0 flex-1 overflow-y-auto">
					<MessageList
						messages={unreadStore.messages}
						{mentionables}
						selfId={participantId}
					/>
				</div>
				<div class="shrink-0">
					<Composer {mentionables} onSubmit={handleSubmit} />
				</div>
			{:else}
				<div class="flex flex-1 items-center justify-center">
					<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
				</div>
			{/if}
		</aside>
	</div>
{/if}
