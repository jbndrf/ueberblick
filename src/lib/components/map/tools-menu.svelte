<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { LogOut, User, Shield } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		onClose?: () => void;
		participant?: {
			name: string;
			email?: string;
		};
		roles?: Array<{ id: string; name: string }>;
		onLogout?: () => void;
	}

	let { open = $bindable(), onClose, participant, roles = [], onLogout }: Props = $props();

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
