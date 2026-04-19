<script lang="ts">
	import { getCachedFileUrlByRecord } from '$lib/participant-state/file-cache';

	interface Props {
		recordId: string;
		fileName: string;
		alt: string;
		class?: string;
	}

	let { recordId, fileName, alt, class: className = '' }: Props = $props();

	let blobUrl = $state<string | null>(null);

	$effect(() => {
		const id = recordId;
		const name = fileName;
		blobUrl = null;
		let cancelled = false;
		getCachedFileUrlByRecord(id, name).then((url) => {
			if (!cancelled) blobUrl = url;
		});
		return () => {
			cancelled = true;
		};
	});

	const src = $derived(
		blobUrl ?? `/api/files/workflow_instance_field_values/${recordId}/${encodeURIComponent(fileName)}`
	);
</script>

<img {src} {alt} class={className} loading="lazy" />
