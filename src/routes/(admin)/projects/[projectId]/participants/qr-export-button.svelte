<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { QrCode, Loader2 } from '@lucide/svelte';
	import { generateQrPdf } from '$lib/utils/qr-pdf-export';

	interface Props {
		selectedParticipants: { name: string; token: string }[];
	}

	let { selectedParticipants }: Props = $props();
	let loading = $state(false);

	async function handleExport() {
		loading = true;
		try {
			await generateQrPdf(selectedParticipants);
			toast.success(m.participantsQrExportSuccess?.() ?? 'QR code PDF exported successfully');
		} catch (e) {
			console.error('QR PDF export failed:', e);
			toast.error(m.participantsQrExportError?.() ?? 'Failed to export QR code PDF');
		} finally {
			loading = false;
		}
	}
</script>

{#if selectedParticipants.length > 0}
	<Button variant="outline" size="sm" onclick={handleExport} disabled={loading}>
		{#if loading}
			<Loader2 class="mr-2 h-4 w-4 animate-spin" />
		{:else}
			<QrCode class="mr-2 h-4 w-4" />
		{/if}
		{m.participantsExportQr?.({ count: selectedParticipants.length }) ?? `Export QR (${selectedParticipants.length})`}
	</Button>
{/if}
