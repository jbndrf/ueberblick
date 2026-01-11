<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { participantLoginSchema } from '$lib/schemas/auth';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import { AlertCircle, MapPin, QrCode, KeyRound } from 'lucide-svelte';
	import LanguageSwitcher from '$lib/components/language-switcher.svelte';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';

	let { data } = $props();

	const form = superForm(data.form, {
		validators: zodClient(participantLoginSchema),
		onResult: ({ result }) => {
			// Explicitly handle redirect responses
			if (result.type === 'redirect') {
				// Force a full page navigation to follow the redirect
				window.location.href = result.location;
			}
		}
	});

	const { form: formData, enhance, errors, message, delayed } = form;

	let activeTab = $state('token');
</script>

<svelte:head>
	<title>{m.participantLoginTitle()} - Karte</title>
</svelte:head>

<div
	class="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900"
>
	<!-- Theme and Language Controls -->
	<div class="fixed right-4 top-4 flex items-center gap-2">
		<LanguageSwitcher />
		<ThemeToggle />
	</div>

	<Card.Root class="w-full max-w-md">
		<Card.Header class="space-y-1 text-center">
			<div
				class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"
			>
				<MapPin class="h-6 w-6 text-primary" />
			</div>
			<Card.Title class="text-2xl font-bold">{m.participantLoginTitle()}</Card.Title>
			<Card.Description>{m.participantLoginSubtitle()}</Card.Description>
		</Card.Header>

		<Card.Content>
			<Tabs.Root bind:value={activeTab} class="w-full">
				<Tabs.List class="grid w-full grid-cols-2">
					<Tabs.Trigger value="token">
						<KeyRound class="mr-2 h-4 w-4" />
						{m.participantLoginTabToken()}
					</Tabs.Trigger>
					<Tabs.Trigger value="qr">
						<QrCode class="mr-2 h-4 w-4" />
						{m.participantLoginTabQr()}
					</Tabs.Trigger>
				</Tabs.List>

				<!-- Token Login Tab -->
				<Tabs.Content value="token" class="mt-4">
					<form method="POST" use:enhance class="space-y-4">
						<div class="space-y-2">
							<Label for="token">{m.participantLoginTokenLabel()}</Label>
							<Input
								id="token"
								name="token"
								type="text"
								placeholder={m.participantLoginTokenPlaceholder()}
								autocomplete="off"
								autocapitalize="none"
								spellcheck="false"
								required
								bind:value={$formData.token}
								class={$errors.token ? 'border-destructive' : ''}
							/>
							{#if $errors.token}
								<p class="text-sm text-destructive">{$errors.token}</p>
							{/if}
						</div>

						<!-- Error Message -->
						{#if $message}
							<div
								class="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
							>
								<AlertCircle class="h-4 w-4" />
								<span>{$message}</span>
							</div>
						{/if}

						<!-- Submit Button -->
						<Button type="submit" class="w-full" disabled={$delayed}>
							{#if $delayed}
								{m.participantLoginSubmitting()}
							{:else}
								{m.participantLoginSubmit()}
							{/if}
						</Button>
					</form>

					<div class="mt-4 text-center text-sm text-muted-foreground">
						<p>
							Or <button
								type="button"
								class="text-primary hover:underline"
								onclick={() => (activeTab = 'qr')}
							>
								{m.participantLoginSwitchToQr()}
							</button>
						</p>
					</div>
				</Tabs.Content>

				<!-- QR Code Tab -->
				<Tabs.Content value="qr" class="mt-4">
					<div class="space-y-4">
						<div
							class="flex min-h-[200px] items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/10 p-8 text-center"
						>
							<div class="space-y-2">
								<QrCode class="mx-auto h-12 w-12 text-muted-foreground/50" />
								<p class="text-sm text-muted-foreground">
									QR code scanning will be available in a future update
								</p>
								<p class="text-xs text-muted-foreground">Please use token login for now</p>
							</div>
						</div>

						<div class="text-center text-sm text-muted-foreground">
							<p>
								Or <button
									type="button"
									class="text-primary hover:underline"
									onclick={() => (activeTab = 'token')}
								>
									{m.participantLoginSwitchToToken()}
								</button>
							</p>
						</div>
					</div>
				</Tabs.Content>
			</Tabs.Root>
		</Card.Content>
	</Card.Root>
</div>

<style>
	:global(body) {
		overflow: hidden;
	}
</style>
