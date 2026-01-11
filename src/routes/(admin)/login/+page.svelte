<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { loginSchema } from '$lib/schemas/auth';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Card from '$lib/components/ui/card';
	import { Eye, EyeOff, Lock, AlertCircle } from 'lucide-svelte';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import LanguageSwitcher from '$lib/components/language-switcher.svelte';

	let { data } = $props();

	const form = superForm(data.form, {
		validators: zodClient(loginSchema)
	});

	const { form: formData, enhance, errors, message, delayed } = form;

	let showPassword = $state(false);

	function togglePasswordVisibility() {
		showPassword = !showPassword;
	}
</script>

<svelte:head>
	<title>{m.loginTitle()} - Admin Interface</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-4 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
	<!-- Theme and Language Controls -->
	<div class="fixed right-4 top-4 flex items-center gap-2">
		<LanguageSwitcher />
		<ThemeToggle />
	</div>

	<Card.Root class="w-full max-w-md">
		<Card.Header class="space-y-1 text-center">
			<div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
				<Lock class="h-6 w-6 text-primary" />
			</div>
			<Card.Title class="text-2xl font-bold">{m.loginTitle()}</Card.Title>
			<Card.Description>{m.loginSubtitle()}</Card.Description>
		</Card.Header>

		<Card.Content>
			<form method="POST" use:enhance class="space-y-4">
				<!-- Email Field -->
				<div class="space-y-2">
					<Label for="email">{m.loginEmailLabel()}</Label>
					<Input
						id="email"
						name="email"
						type="email"
						placeholder={m.loginEmailPlaceholder()}
						autocomplete="email"
						required
						bind:value={$formData.email}
						class={$errors.email ? 'border-destructive' : ''}
					/>
					{#if $errors.email}
						<p class="text-sm text-destructive">{$errors.email}</p>
					{/if}
				</div>

				<!-- Password Field -->
				<div class="space-y-2">
					<Label for="password">{m.loginPasswordLabel()}</Label>
					<div class="relative">
						<Input
							id="password"
							name="password"
							type={showPassword ? 'text' : 'password'}
							placeholder={m.loginPasswordPlaceholder()}
							autocomplete="current-password"
							required
							bind:value={$formData.password}
							class={$errors.password ? 'pr-10 border-destructive' : 'pr-10'}
						/>
						<button
							type="button"
							onclick={togglePasswordVisibility}
							class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							aria-label={showPassword ? m.loginHidePassword() : m.loginShowPassword()}
						>
							{#if showPassword}
								<EyeOff class="h-4 w-4" />
							{:else}
								<Eye class="h-4 w-4" />
							{/if}
						</button>
					</div>
					{#if $errors.password}
						<p class="text-sm text-destructive">{$errors.password}</p>
					{/if}
				</div>

				<!-- Remember Me -->
				<div class="flex items-center space-x-2">
					<Checkbox id="remember" name="remember" bind:checked={$formData.remember} />
					<Label for="remember" class="text-sm font-normal cursor-pointer">
						{m.loginRememberMe()}
					</Label>
				</div>

				<!-- Error Message -->
				{#if $message}
					<div class="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
						<AlertCircle class="h-4 w-4" />
						<span>{$message}</span>
					</div>
				{/if}

				<!-- Submit Button -->
				<Button type="submit" class="w-full" disabled={$delayed}>
					{#if $delayed}
						{m.loginSigningIn()}
					{:else}
						{m.loginSignIn()}
					{/if}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>

<style>
	:global(body) {
		overflow: hidden;
	}
</style>
