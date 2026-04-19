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
	import { AlertCircle, MapPin, QrCode, KeyRound, Camera, Upload, Loader2 } from 'lucide-svelte';
	import LanguageSwitcher from '$lib/components/language-switcher.svelte';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import ConsentModal from '$lib/components/consent-modal.svelte';
	import { onMount, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';

	let { data } = $props();
	const loginReturnTo = $derived($page.url.pathname + $page.url.search);

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
	let qrScanner: any = $state(null);
	let scannerReady = $state(false);
	let scannerError = $state<string | null>(null);
	let scanningActive = $state(false);
	let formElement: HTMLFormElement | null = $state(null);

	async function initQrScanner() {
		if (!browser) return;

		try {
			const { Html5Qrcode } = await import('html5-qrcode');
			qrScanner = new Html5Qrcode('qr-reader');
			scannerReady = true;
		} catch (err) {
			console.error('Failed to initialize QR scanner:', err);
			scannerError = m.participantLoginQrInitError?.() ?? 'Failed to initialize QR scanner';
		}
	}

	async function startCameraScanning() {
		if (!qrScanner || scanningActive) return;

		scannerError = null;
		try {
			scanningActive = true;
			await qrScanner.start(
				{ facingMode: 'environment' },
				{ fps: 10, qrbox: { width: 250, height: 250 } },
				onQrCodeScanned,
				() => {} // ignore errors during scanning
			);
		} catch (err: any) {
			scanningActive = false;
			console.error('Camera error:', err);
			scannerError = err?.message || (m.participantLoginQrCameraError?.() ?? 'Could not access camera. Try uploading an image instead.');
		}
	}

	async function stopCameraScanning() {
		if (qrScanner && scanningActive) {
			try {
				await qrScanner.stop();
			} catch {
				// ignore stop errors
			}
			scanningActive = false;
		}
	}

	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !qrScanner) return;

		scannerError = null;
		try {
			const result = await qrScanner.scanFile(file, true);
			onQrCodeScanned(result);
		} catch (err: any) {
			console.error('File scan error:', err);
			scannerError = m.participantLoginQrFileError?.() ?? 'Could not read QR code from image. Make sure the image contains a valid QR code.';
		}
		// Reset input so same file can be selected again
		input.value = '';
	}

	async function onQrCodeScanned(decodedText: string) {
		// Stop camera if running
		stopCameraScanning();

		// Set the token, switch to token tab, and submit
		$formData.token = decodedText.trim();
		activeTab = 'token';
		await tick();
		formElement?.requestSubmit();
	}

	onMount(() => {
		initQrScanner();
		return () => {
			stopCameraScanning();
		};
	});

	// Stop camera when switching away from QR tab
	$effect(() => {
		if (activeTab !== 'qr') {
			stopCameraScanning();
		}
	});
</script>

<svelte:head>
	<title>{m.participantLoginTitle()} - Überblick</title>
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
					<form method="POST" action="?/login" use:enhance bind:this={formElement} class="space-y-4">
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
								data-testid="token-input"
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
						<Button type="submit" class="w-full" disabled={$delayed} data-testid="login-button">
							{#if $delayed}
								{m.participantLoginSubmitting()}
							{:else}
								{m.participantLoginSubmit()}
							{/if}
						</Button>
					</form>

					<div class="mt-4 text-center text-sm text-muted-foreground">
						<p>
							{m.participantLoginOr?.() ?? 'Or'} <button
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
						<!-- QR Scanner Container -->
						<div
							id="qr-reader"
							class="min-h-[250px] overflow-hidden rounded-lg border-2 border-muted-foreground/25 bg-muted/10"
						></div>

						<!-- Scanner Error -->
						{#if scannerError}
							<div
								class="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
							>
								<AlertCircle class="h-4 w-4 shrink-0" />
								<span>{scannerError}</span>
							</div>
						{/if}

						<!-- Scanner Controls -->
						<div class="flex gap-2">
							{#if !scanningActive}
								<Button
									type="button"
									variant="outline"
									class="flex-1"
									onclick={startCameraScanning}
									disabled={!scannerReady}
								>
									<Camera class="mr-2 h-4 w-4" />
									{scannerReady ? (m.participantLoginStartCamera?.() ?? 'Start Camera') : (m.participantLoginLoading?.() ?? 'Loading...')}
								</Button>
							{:else}
								<Button
									type="button"
									variant="outline"
									class="flex-1"
									onclick={stopCameraScanning}
								>
									<Loader2 class="mr-2 h-4 w-4 animate-spin" />
									{m.participantLoginStopCamera?.() ?? 'Stop Camera'}
								</Button>
							{/if}

							<Button type="button" variant="outline" class="flex-1" disabled={!scannerReady}>
								<label class="flex cursor-pointer items-center justify-center">
									<Upload class="mr-2 h-4 w-4" />
									{m.participantLoginUploadQrImage?.() ?? 'Upload QR Image'}
									<input
										type="file"
										accept="image/*"
										class="hidden"
										onchange={handleFileUpload}
									/>
								</label>
							</Button>
						</div>

						<p class="text-center text-xs text-muted-foreground">
							{m.participantLoginQrHint?.() ?? 'Scan a QR code with your camera or upload an image'}
						</p>

						<div class="text-center text-sm text-muted-foreground">
							<p>
								{m.participantLoginOr?.() ?? 'Or'} <button
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

<ConsentModal
	visible={data.consent.needsConsent}
	title={data.consent.title}
	body={data.consent.body}
	acceptLabel={data.consent.acceptLabel}
	rejectLabel={data.consent.rejectLabel}
	footerPages={data.consent.footerPages}
	returnTo={loginReturnTo}
/>

<style>
	:global(body) {
		overflow: hidden;
	}

	/* Style the html5-qrcode scanner */
	:global(#qr-reader video) {
		border-radius: 0.5rem;
	}

	:global(#qr-reader__scan_region) {
		min-height: 200px;
	}

	:global(#qr-reader__dashboard) {
		display: none !important;
	}
</style>
