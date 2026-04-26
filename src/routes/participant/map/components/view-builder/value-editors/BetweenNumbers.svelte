<script lang="ts">
	import { Input } from '$lib/components/ui/input';

	interface Props {
		min: number | null;
		max: number | null;
		onChange: (next: { min: number | null; max: number | null }) => void;
	}

	let { min, max, onChange }: Props = $props();

	function parse(v: string): number | null {
		const trimmed = v.trim();
		if (trimmed === '') return null;
		const n = Number(trimmed);
		return Number.isFinite(n) ? n : null;
	}
</script>

<div class="flex flex-1 items-center gap-2">
	<Input
		type="number"
		class="h-8 w-24"
		value={min ?? ''}
		placeholder="min"
		oninput={(e) => onChange({ min: parse((e.target as HTMLInputElement).value), max })}
	/>
	<span class="text-xs text-muted-foreground">–</span>
	<Input
		type="number"
		class="h-8 w-24"
		value={max ?? ''}
		placeholder="max"
		oninput={(e) => onChange({ min, max: parse((e.target as HTMLInputElement).value) })}
	/>
</div>
