<script lang="ts">
	import { Input } from '$lib/components/ui/input';

	interface Props {
		days: number;
		onChange: (next: number) => void;
	}

	let { days, onChange }: Props = $props();
</script>

<div class="flex flex-1 items-center gap-2">
	<Input
		type="number"
		min="1"
		class="h-8 w-20"
		value={days}
		oninput={(e) => {
			const n = parseInt((e.target as HTMLInputElement).value, 10);
			if (Number.isFinite(n) && n > 0) onChange(n);
		}}
	/>
	<span class="text-xs text-muted-foreground">days</span>
</div>
