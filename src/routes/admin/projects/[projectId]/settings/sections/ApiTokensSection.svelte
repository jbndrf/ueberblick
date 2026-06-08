<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import {
		apiTokensTitle,
		apiTokensDescription,
		apiTokensCreateLabel,
		apiTokensCreatePlaceholder,
		apiTokensExpiryLabel,
		apiTokensCreateButton,
		apiTokensCreating,
		apiTokensCreateError,
		apiTokensCreatedTitle,
		apiTokensCreatedHint,
		apiTokensCopy,
		apiTokensCopied,
		apiTokensNone,
		apiTokensColLabel,
		apiTokensColCreated,
		apiTokensColLastUsed,
		apiTokensColExpires,
		apiTokensNever,
		apiTokensRevoke,
		apiTokensRevokeConfirm,
		apiTokensRevokeError,
		apiTokensRevoked,
		apiTokensUsageTitle,
		apiTokensUsageStep1,
		apiTokensUsageStep2,
		apiTokensUsageStep3,
		apiTokensLayerUrlsTitle,
		apiTokensIndexUrlLabel,
		apiTokensMarkersUrlLabel
	} from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from 'svelte-sonner';
	import { Copy, Trash2 } from '@lucide/svelte';
	import SettingsSection from '../SettingsSection.svelte';

	let { data } = $props();

	type TokenRow = {
		id: string;
		label: string;
		last_four: string;
		project_id: string;
		expires_at: string;
		last_used_at: string;
		revoked: boolean;
		created: string;
	};

	const tokens = $derived<TokenRow[]>((data.apiTokens ?? []) as TokenRow[]);
	const projectId = $derived((data.project as { id: string }).id);
	const workflows = $derived<Array<{ id: string; name: string }>>(
		(data.workflows ?? []) as Array<{ id: string; name: string }>
	);
	const base = $derived(`${page.url.origin}/api/geo/projects/${projectId}`);
	// QGIS reads these via GDAL's streaming HTTP handler (the endpoint is a
	// dynamic, chunked response with no range support, so plain /vsicurl/ fails).
	// The File source type has no auth field, so the token goes in the URL — we
	// can't show the raw token here (shown once at creation), hence the placeholder.
	const qgisPath = (url: string) => `/vsicurl_streaming/${url}?token=<YOUR_TOKEN>`;

	let newLabel = $state('');
	let newExpiry = $state('');
	let creating = $state(false);
	let createdToken = $state<string | null>(null);

	function fmtDate(v: string): string {
		if (!v) return apiTokensNever?.() ?? 'Never';
		try {
			return new Date(v).toLocaleDateString();
		} catch {
			return v;
		}
	}

	async function createToken() {
		creating = true;
		createdToken = null;
		try {
			const fd = new FormData();
			fd.append('label', newLabel);
			if (newExpiry) fd.append('expires_at', new Date(`${newExpiry}T23:59:59Z`).toISOString());
			const res = await fetch('?/createApiToken', { method: 'POST', body: fd });
			const result = deserialize(await res.text());
			if (result.type === 'success' && result.data?.rawToken) {
				createdToken = result.data.rawToken as string;
				newLabel = '';
				newExpiry = '';
				await invalidateAll();
			} else {
				throw new Error('no token returned');
			}
		} catch (err) {
			console.error('Error creating API token:', err);
			toast.error(apiTokensCreateError?.() ?? 'Failed to create token');
		} finally {
			creating = false;
		}
	}

	async function revokeToken(id: string) {
		if (!confirm(apiTokensRevokeConfirm?.() ?? 'Revoke this token?')) return;
		try {
			const fd = new FormData();
			fd.append('token_id', id);
			const res = await fetch('?/revokeApiToken', { method: 'POST', body: fd });
			const result = deserialize(await res.text());
			if (result.type !== 'success') throw new Error('revoke failed');
			toast.success(apiTokensRevoked?.() ?? 'Token revoked');
			await invalidateAll();
		} catch (err) {
			console.error('Error revoking API token:', err);
			toast.error(apiTokensRevokeError?.() ?? 'Failed to revoke token');
		}
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(apiTokensCopied?.() ?? 'Copied');
		} catch {
			/* clipboard unavailable */
		}
	}
</script>

<SettingsSection
	name={apiTokensTitle?.() ?? 'QGIS / GIS access'}
	description={apiTokensDescription?.() ??
		"Issue read-only access tokens to pull this project's data into QGIS."}
>
	<div class="flex flex-col gap-6">
		<!-- Create -->
		<div class="space-y-3 rounded-md border p-4">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
				<div class="flex-1 space-y-1">
					<Label for="api-token-label">{apiTokensCreateLabel?.() ?? 'Token label'}</Label>
					<Input
						id="api-token-label"
						bind:value={newLabel}
						placeholder={apiTokensCreatePlaceholder?.() ?? 'e.g. My laptop QGIS'}
					/>
				</div>
				<div class="space-y-1">
					<Label for="api-token-expiry">{apiTokensExpiryLabel?.() ?? 'Expires (optional)'}</Label>
					<Input id="api-token-expiry" type="date" bind:value={newExpiry} />
				</div>
				<Button onclick={createToken} disabled={creating}>
					{creating
						? (apiTokensCreating?.() ?? 'Creating…')
						: (apiTokensCreateButton?.() ?? 'Create token')}
				</Button>
			</div>

			{#if createdToken}
				<div class="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
					<div class="text-sm font-medium">
						{apiTokensCreatedTitle?.() ?? 'Token created — copy it now'}
					</div>
					<div class="flex items-center gap-2">
						<code class="flex-1 overflow-x-auto rounded bg-muted px-2 py-1 text-xs"
							>{createdToken}</code
						>
						<Button variant="outline" size="sm" onclick={() => copy(createdToken!)}>
							<Copy class="mr-1 h-3.5 w-3.5" />{apiTokensCopy?.() ?? 'Copy'}
						</Button>
					</div>
					<p class="text-xs text-muted-foreground">
						{apiTokensCreatedHint?.() ?? 'This is the only time the full token is shown.'}
					</p>
				</div>
			{/if}
		</div>

		<!-- Existing tokens -->
		{#if tokens.length === 0}
			<p class="text-sm text-muted-foreground">{apiTokensNone?.() ?? 'No tokens yet.'}</p>
		{:else}
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<thead class="bg-muted/50 text-left text-xs text-muted-foreground">
						<tr>
							<th class="px-3 py-2">{apiTokensColLabel?.() ?? 'Label'}</th>
							<th class="px-3 py-2">{apiTokensColCreated?.() ?? 'Created'}</th>
							<th class="px-3 py-2">{apiTokensColLastUsed?.() ?? 'Last used'}</th>
							<th class="px-3 py-2">{apiTokensColExpires?.() ?? 'Expires'}</th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#each tokens as t (t.id)}
							<tr class="border-t">
								<td class="px-3 py-2">
									<span class="font-medium">{t.label || '—'}</span>
									<span class="ml-1 text-xs text-muted-foreground">…{t.last_four}</span>
								</td>
								<td class="px-3 py-2 text-muted-foreground">{fmtDate(t.created)}</td>
								<td class="px-3 py-2 text-muted-foreground">{fmtDate(t.last_used_at)}</td>
								<td class="px-3 py-2 text-muted-foreground">{fmtDate(t.expires_at)}</td>
								<td class="px-3 py-2 text-right">
									<Button variant="ghost" size="sm" onclick={() => revokeToken(t.id)}>
										<Trash2 class="mr-1 h-3.5 w-3.5" />{apiTokensRevoke?.() ?? 'Revoke'}
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<!-- How to use in QGIS -->
		<div class="space-y-2 rounded-md border p-4">
			<div class="text-sm font-medium">{apiTokensUsageTitle?.() ?? 'Add a layer in QGIS'}</div>
			<ol class="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
				<li>{apiTokensUsageStep1?.() ?? ''}</li>
				<li>{apiTokensUsageStep2?.() ?? ''}</li>
				<li>{apiTokensUsageStep3?.() ?? ''}</li>
			</ol>

			<div class="pt-2 text-sm font-medium">{apiTokensLayerUrlsTitle?.() ?? 'Layer URLs'}</div>
			<ul class="space-y-1 text-xs">
				<li class="flex items-center gap-2">
					<code class="flex-1 overflow-x-auto rounded bg-muted px-2 py-1">{base}</code>
					<span class="shrink-0 text-muted-foreground"
						>{apiTokensIndexUrlLabel?.() ?? 'Layer index'}</span
					>
					<Button variant="outline" size="sm" onclick={() => copy(base)}>
						<Copy class="h-3.5 w-3.5" />
					</Button>
				</li>
				{#each workflows as wf (wf.id)}
					<li class="flex items-center gap-2">
						<code class="flex-1 overflow-x-auto rounded bg-muted px-2 py-1"
							>{qgisPath(`${base}/workflows/${wf.id}.geojson`)}</code
						>
						<span class="shrink-0 text-muted-foreground">{wf.name}</span>
						<Button
							variant="outline"
							size="sm"
							onclick={() => copy(qgisPath(`${base}/workflows/${wf.id}.geojson`))}
						>
							<Copy class="h-3.5 w-3.5" />
						</Button>
					</li>
				{/each}
				<li class="flex items-center gap-2">
					<code class="flex-1 overflow-x-auto rounded bg-muted px-2 py-1"
						>{qgisPath(`${base}/markers.geojson`)}</code
					>
					<span class="shrink-0 text-muted-foreground"
						>{apiTokensMarkersUrlLabel?.() ?? 'Markers'}</span
					>
					<Button
						variant="outline"
						size="sm"
						onclick={() => copy(qgisPath(`${base}/markers.geojson`))}
					>
						<Copy class="h-3.5 w-3.5" />
					</Button>
				</li>
			</ul>
		</div>
	</div>
</SettingsSection>
