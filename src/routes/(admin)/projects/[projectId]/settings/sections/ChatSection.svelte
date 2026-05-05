<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import { toast } from 'svelte-sonner';
	import SettingsSection from '../SettingsSection.svelte';

	let { data } = $props();

	let chatEnabled = $state<boolean>(!!(data.project as { chat_enabled?: boolean }).chat_enabled);
	let chatVisibleToRoleIds = $state<string[]>(
		Array.isArray((data.project as { chat_visible_to_roles?: string[] }).chat_visible_to_roles)
			? [...((data.project as { chat_visible_to_roles?: string[] }).chat_visible_to_roles ?? [])]
			: []
	);
	let savingChat = $state(false);

	async function saveChatSettings() {
		savingChat = true;
		try {
			const fd = new FormData();
			fd.append('chat_enabled', String(chatEnabled));
			fd.append('chat_visible_to_roles', JSON.stringify(chatVisibleToRoleIds));
			const res = await fetch('?/saveChatSettings', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(await res.text());
			toast.success(m.settingsChatSaved?.() ?? 'Chat settings saved');
			await invalidateAll();
		} catch (err) {
			console.error('Error saving chat settings:', err);
			toast.error(m.settingsChatSaveError?.() ?? 'Failed to save chat settings');
		} finally {
			savingChat = false;
		}
	}
</script>

<SettingsSection
	name={m.settingsChatTitle?.() ?? 'Project chat'}
	description={m.settingsChatDescription?.() ??
		'Enable a project-wide chat for participants. When enabled, members can read, write, and mention each other.'}
>
	<div class="flex flex-col gap-4">
		<div class="flex items-center justify-between gap-4 rounded-md border p-4">
			<div class="flex flex-col">
				<span class="font-medium">{m.settingsChatEnableLabel?.() ?? 'Enable project chat'}</span>
				<span class="text-xs text-muted-foreground">
					{m.settingsChatEnableHint?.() ??
						'When off, the chat is hidden from every participant in this project.'}
				</span>
			</div>
			<Switch bind:checked={chatEnabled} />
		</div>

		{#if chatEnabled}
			<div class="space-y-2">
				<Label>{m.settingsChatRolesLabel?.() ?? 'Roles allowed in chat'}</Label>
				<MobileMultiSelect
					bind:selectedIds={chatVisibleToRoleIds}
					options={(data.roles ?? []) as Array<{ id: string; name: string; description?: string }>}
					getOptionId={(r: { id: string }) => r.id}
					getOptionLabel={(r: { name: string }) => r.name}
					getOptionDescription={(r: { description?: string }) => r.description}
					placeholder={m.settingsChatRolesPlaceholder?.() ?? 'Empty = everyone in the project'}
				/>
				<p class="text-xs text-muted-foreground">
					{m.settingsChatRolesHint?.() ??
						'Empty list = open to every participant in this project. Add roles to restrict membership.'}
				</p>
			</div>
		{/if}

		<div>
			<Button onclick={saveChatSettings} disabled={savingChat}>
				{savingChat
					? (m.settingsAdvancedSavingEllipsis?.() ?? 'Saving…')
					: (m.commonSave?.() ?? 'Save')}
			</Button>
		</div>
	</div>
</SettingsSection>
