<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';

	interface BooleanFieldProps {
		value: any;
		rowId: string;
		onToggle?: (rowId: string, value: boolean) => Promise<void>;
		displayAsText?: boolean;
	}

	let { value, rowId, onToggle, displayAsText = false }: BooleanFieldProps = $props();

	const boolValue = $derived(value === true || value === 'true' || value === 1);

	async function handleToggle(checked: boolean | 'indeterminate') {
		if (checked === 'indeterminate' || !onToggle) return;
		await onToggle(rowId, checked);
	}
</script>

{#if onToggle && !displayAsText}
	<Switch checked={boolValue} onCheckedChange={handleToggle} />
{:else}
	<Badge variant={boolValue ? 'default' : 'secondary'}>
		{boolValue ? 'Yes' : 'No'}
	</Badge>
{/if}
