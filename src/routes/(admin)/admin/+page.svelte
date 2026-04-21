<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { LogOut, CheckCircle } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
</script>

<svelte:head>
	<title>{m.adminDashboardPageTitle?.() ?? 'Welcome - Admin Interface'}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-4 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
	<Card.Root class="w-full max-w-md">
		<Card.Header class="space-y-1 text-center">
			<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
				<CheckCircle class="h-8 w-8 text-green-500" />
			</div>
			<Card.Title class="text-3xl font-bold">{m.adminDashboardWelcomeTitle?.() ?? 'Welcome!'}</Card.Title>
			<Card.Description class="text-base">
				{m.adminDashboardWelcomeDescription?.() ?? 'You have successfully logged in.'}
			</Card.Description>
		</Card.Header>

		<Card.Content class="space-y-4">
			<div class="rounded-lg bg-muted p-4 text-center">
				<p class="text-sm text-muted-foreground">{m.adminDashboardLoggedInAs?.() ?? 'Logged in as'}</p>
				<p class="mt-1 font-medium">{(data as any).user?.email}</p>
			</div>

			<form method="POST" action="/logout" class="w-full">
				<Button variant="outline" type="submit" class="w-full">
					<LogOut class="mr-2 h-4 w-4" />
					{m.adminDashboardLogout?.() ?? 'Logout'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
