<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import { LogOut, User, Shield, Wifi, WifiOff, Loader2, Download, Upload } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import { downloadAll, uploadChanges, getSyncProgress } from '$lib/participant-state/sync.svelte';

	interface Props {
		open: boolean;
		onClose?: () => void;
		participant?: {
			name: string;
			email?: string;
		};
		roles?: Array<{ id: string; name: string }>;
		collectionNames?: string[];
		onLogout?: () => void;
	}

	let { open = $bindable(), onClose, participant, roles = [], collectionNames = [], onLogout }: Props = $props();

	// Gateway for online/offline toggle
	const gateway = getParticipantGateway();

	// Sync state
	let isSyncing = $state(false);
	let syncError = $state<string | null>(null);
	let syncAction = $state<'download' | 'upload' | null>(null);

	async function handleOfflineToggle(checked: boolean) {
		if (!gateway) return;

		isSyncing = true;
		syncError = null;

		try {
			if (checked) {
				// Going offline - download all data first
				syncAction = 'download';
				await downloadAll(gateway, collectionNames);
				gateway.setOfflineMode(true);
			} else {
				// Going online - upload changes first
				syncAction = 'upload';
				await uploadChanges(gateway);
				gateway.setOfflineMode(false);
			}
		} catch (error) {
			syncError = error instanceof Error ? error.message : 'Sync failed';
			console.error('Sync error:', error);
		} finally {
			isSyncing = false;
			syncAction = null;
		}
	}

	function handleClose() {
		open = false;
		onClose?.();
	}

	function handleLogout() {
		onLogout?.();
		handleClose();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Tools & Settings</Dialog.Title>
			<Dialog.Description>Participant information and actions</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-4">
			<!-- Participant Info -->
			{#if participant}
				<div class="rounded-lg border bg-muted/50 p-4">
					<div class="mb-2 flex items-center gap-2 text-sm font-medium">
						<User class="h-4 w-4" />
						<span>Participant</span>
					</div>
					<div class="space-y-1">
						<div class="font-medium">{participant.name}</div>
						{#if participant.email}
							<div class="text-sm text-muted-foreground">{participant.email}</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Roles -->
			{#if roles.length > 0}
				<div class="rounded-lg border bg-muted/50 p-4">
					<div class="mb-3 flex items-center gap-2 text-sm font-medium">
						<Shield class="h-4 w-4" />
						<span>Your Roles</span>
					</div>
					<div class="flex flex-wrap gap-2">
						{#each roles as role}
							<Badge variant="secondary">{role.name}</Badge>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Offline Mode Toggle -->
			{#if gateway}
				<div class="rounded-lg border bg-muted/50 p-4">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							{#if isSyncing}
								<Loader2 class="h-4 w-4 animate-spin text-blue-600" />
								<span class="text-sm font-medium">
									{syncAction === 'download' ? 'Downloading...' : 'Uploading...'}
								</span>
							{:else if gateway.isOnline}
								<Wifi class="h-4 w-4 text-green-600" />
								<span class="text-sm font-medium">Online</span>
							{:else}
								<WifiOff class="h-4 w-4 text-orange-600" />
								<span class="text-sm font-medium">Offline</span>
							{/if}
						</div>
						<Switch
							checked={!gateway.isOnline}
							onCheckedChange={handleOfflineToggle}
							disabled={isSyncing}
							aria-label="Toggle offline mode"
						/>
					</div>

					{#if syncError}
						<p class="mt-2 text-xs text-destructive">{syncError}</p>
					{:else if isSyncing}
						<p class="mt-2 text-xs text-muted-foreground">
							{syncAction === 'download'
								? 'Downloading data for offline use...'
								: 'Uploading your changes...'}
						</p>
					{:else}
						<p class="mt-2 text-xs text-muted-foreground">
							{gateway.isOnline
								? 'Toggle to download data and work offline.'
								: 'Working offline. Toggle to sync changes and go online.'}
						</p>
					{/if}

					{#if !gateway.isOnline && gateway.pendingCount > 0}
						<div class="mt-2 flex items-center gap-1 text-xs text-orange-600">
							<Upload class="h-3 w-3" />
							<span>{gateway.pendingCount} changes pending upload</span>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Actions -->
			<div class="space-y-2">
				<Button variant="outline" class="w-full justify-start" onclick={handleLogout}>
					<LogOut class="mr-2 h-4 w-4" />
					Logout
				</Button>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={handleClose}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
