<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Image, Upload, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import SettingsSection from '../SettingsSection.svelte';

	let { data } = $props();

	let displayName = $state(data.displayName ?? '');
	let isSavingDisplayName = $state(false);

	let iconFileInput = $state<HTMLInputElement | null>(null);
	let iconPreview = $state<string | null>(null);
	let isUploadingIcon = $state(false);

	function handleIconPreview(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = () => {
				iconPreview = reader.result as string;
			};
			reader.readAsDataURL(file);
		}
	}
</script>

<SettingsSection
	name={m.settingsAppBranding?.() ?? 'App Branding'}
	description={m.settingsAppBrandingDescription?.() ??
		'Customize the icon and name shown in the participant app'}
>
	<div class="flex items-start gap-6">
		<!-- Current Icon Preview -->
		<div class="shrink-0">
			{#if iconPreview}
				<img
					src={iconPreview}
					alt={m.generalSettingsIconPreviewAlt?.() ?? 'Icon preview'}
					class="h-20 w-20 rounded-lg border object-cover"
				/>
			{:else if data.iconUrl}
				<img
					src={data.iconUrl}
					alt={m.generalSettingsProjectIconAlt?.() ?? 'Project icon'}
					class="h-20 w-20 rounded-lg border object-cover"
				/>
			{:else}
				<div
					class="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed bg-muted/50"
				>
					<Image class="h-8 w-8 text-muted-foreground" />
				</div>
			{/if}
		</div>

		<!-- Upload Form & Display Name -->
		<div class="flex-1 space-y-4">
			<form
				method="POST"
				action="?/updateDisplayName"
				use:enhance={() => {
					isSavingDisplayName = true;
					return async ({ result }) => {
						isSavingDisplayName = false;
						if (result.type === 'success') {
							toast.success(m.generalSettingsDisplayNameSaved?.() ?? 'Display name saved');
							await invalidateAll();
						} else {
							toast.error(
								m.generalSettingsDisplayNameSaveError?.() ?? 'Failed to save display name'
							);
						}
					};
				}}
			>
				<div class="space-y-2">
					<Label for="display_name">{m.settingsDisplayName?.() ?? 'App Name'}</Label>
					<div class="flex items-center gap-3">
						<Input
							id="display_name"
							name="display_name"
							bind:value={displayName}
							placeholder={data.project.name}
							class="max-w-xs"
						/>
						<Button type="submit" size="sm" disabled={isSavingDisplayName}>
							{m.commonSave?.() ?? 'Save'}
						</Button>
					</div>
					<p class="text-xs text-muted-foreground">
						{m.settingsDisplayNameHint?.() ??
							'Name shown in the participant app header. Leave empty to use the project name.'}
					</p>
				</div>
			</form>

			<form
				method="POST"
				action="?/updateAppIcon"
				enctype="multipart/form-data"
				use:enhance={() => {
					isUploadingIcon = true;
					return async ({ result }) => {
						isUploadingIcon = false;
						if (result.type === 'success') {
							toast.success(m.generalSettingsIconUploaded?.() ?? 'Icon uploaded');
							iconPreview = null;
							await invalidateAll();
						} else {
							toast.error(m.generalSettingsIconUploadError?.() ?? 'Failed to upload icon');
						}
					};
				}}
			>
				<div class="space-y-2">
					<Label>{m.settingsUploadIcon?.() ?? 'Upload Icon'}</Label>
					<div class="flex items-center gap-3">
						<Input
							type="file"
							name="icon"
							accept="image/png,image/jpeg,image/svg+xml,image/webp"
							bind:ref={iconFileInput}
							onchange={handleIconPreview}
							class="max-w-xs"
						/>
						<Button type="submit" size="sm" disabled={isUploadingIcon || !iconPreview}>
							<Upload class="mr-2 h-4 w-4" />
							{m.settingsUploadIcon?.() ?? 'Upload Icon'}
						</Button>
					</div>
				</div>
			</form>
			<p class="text-xs text-muted-foreground">
				{m.settingsIconHint?.() ?? 'PNG, JPG, SVG, or WebP. Max 2MB.'}
			</p>

			{#if data.iconUrl}
				<form
					method="POST"
					action="?/removeAppIcon"
					use:enhance={() => {
						return async ({ result }) => {
							if (result.type === 'success') {
								toast.success(m.generalSettingsIconRemoved?.() ?? 'Icon removed');
								iconPreview = null;
								await invalidateAll();
							} else {
								toast.error(m.generalSettingsIconRemoveError?.() ?? 'Failed to remove icon');
							}
						};
					}}
				>
					<Button type="submit" variant="ghost" size="sm" class="text-destructive">
						<X class="mr-2 h-4 w-4" />
						{m.settingsRemoveIcon?.() ?? 'Remove Icon'}
					</Button>
				</form>
			{/if}
		</div>
	</div>
</SettingsSection>
