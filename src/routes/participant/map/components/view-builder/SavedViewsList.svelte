<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Bookmark, Pencil, Trash2, Check, X } from '@lucide/svelte';
	import type { ToolConfigRecord, ViewDefinition } from '$lib/participant-state/types';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		views: ToolConfigRecord<ViewDefinition>[];
		activeViewId: string | null;
		onToggle: (view: ToolConfigRecord<ViewDefinition>, on: boolean) => void;
		onSaveCurrent: (name: string) => void | Promise<void>;
		onRename: (id: string, name: string) => void | Promise<void>;
		onDelete: (id: string) => void | Promise<void>;
	}

	let {
		views,
		activeViewId,
		onToggle,
		onSaveCurrent,
		onRename,
		onDelete
	}: Props = $props();

	let newName = $state('');
	let editingId = $state<string | null>(null);
	let editingName = $state('');

	async function handleSave() {
		const trimmed = newName.trim();
		if (!trimmed) return;
		await onSaveCurrent(trimmed);
		newName = '';
	}

	function startRename(view: ToolConfigRecord<ViewDefinition>) {
		editingId = view.id;
		editingName = view.name;
	}

	async function commitRename() {
		if (!editingId) return;
		const trimmed = editingName.trim();
		if (trimmed) await onRename(editingId, trimmed);
		editingId = null;
		editingName = '';
	}

	function cancelRename() {
		editingId = null;
		editingName = '';
	}
</script>

<div class="space-y-3">
	<h4 class="text-sm font-medium">
		{m.participantSavedViewsTitle?.() ?? 'Saved views'}
	</h4>

	{#if views.length === 0}
		<p class="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
			{m.participantSavedViewsEmpty?.() ?? 'No saved views yet.'}
		</p>
	{:else}
		<div class="space-y-2">
			{#each views as view (view.id)}
				{@const isActive = activeViewId === view.id}
				<div class="flex items-center justify-between rounded-lg border p-3">
					{#if editingId === view.id}
						<Input
							type="text"
							class="h-7 flex-1"
							bind:value={editingName}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									commitRename();
								} else if (e.key === 'Escape') {
									cancelRename();
								}
							}}
						/>
						<div class="ml-2 flex items-center gap-1">
							<Button size="icon" variant="ghost" class="h-7 w-7" onclick={commitRename}>
								<Check class="h-3.5 w-3.5" />
							</Button>
							<Button size="icon" variant="ghost" class="h-7 w-7" onclick={cancelRename}>
								<X class="h-3.5 w-3.5" />
							</Button>
						</div>
					{:else}
						<div class="flex min-w-0 flex-1 items-center gap-2">
							<Bookmark class="h-4 w-4 shrink-0 text-muted-foreground" />
							<span class="truncate text-sm font-medium">{view.name}</span>
						</div>
						<div class="ml-2 flex items-center gap-1">
							<Button
								size="icon"
								variant="ghost"
								class="h-7 w-7"
								onclick={() => startRename(view)}
								title={m.participantSavedViewsRename?.() ?? 'Rename'}
							>
								<Pencil class="h-3.5 w-3.5" />
							</Button>
							<Button
								size="icon"
								variant="ghost"
								class="h-7 w-7"
								onclick={() => onDelete(view.id)}
								title={m.participantSavedViewsDelete?.() ?? 'Delete'}
							>
								<Trash2 class="h-3.5 w-3.5" />
							</Button>
							<Switch
								checked={isActive}
								onCheckedChange={(checked) => onToggle(view, checked)}
							/>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<div class="flex gap-2 pt-1">
		<Input
			type="text"
			placeholder={m.participantSavedViewsNamePlaceholder?.() ?? 'Name this view…'}
			class="h-8 flex-1"
			bind:value={newName}
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					handleSave();
				}
			}}
		/>
		<Button size="sm" onclick={handleSave} disabled={!newName.trim()}>
			{m.participantSavedViewsSave?.() ?? 'Save'}
		</Button>
	</div>
</div>
