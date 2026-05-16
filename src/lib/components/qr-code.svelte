<script lang="ts">
	import QRCode from 'qrcode';

	interface Props {
		value: string;
		size?: number;
		alt?: string;
	}

	let { value, size = 220, alt = 'QR code' }: Props = $props();

	let dataUrl = $state<string | null>(null);
	let renderError = $state<string | null>(null);

	$effect(() => {
		if (!value) {
			dataUrl = null;
			return;
		}
		let cancelled = false;
		QRCode.toDataURL(value, {
			margin: 1,
			width: size,
			errorCorrectionLevel: 'M'
		})
			.then((url) => {
				if (!cancelled) {
					dataUrl = url;
					renderError = null;
				}
			})
			.catch((err) => {
				if (!cancelled) renderError = String(err);
			});
		return () => {
			cancelled = true;
		};
	});
</script>

{#if dataUrl}
	<img src={dataUrl} {alt} width={size} height={size} class="inline-block" />
{:else if renderError}
	<span class="text-xs text-destructive">{renderError}</span>
{/if}
