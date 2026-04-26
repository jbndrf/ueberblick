<script lang="ts">
	import { Input } from '$lib/components/ui/input';

	interface Props {
		from: string | null;
		to: string | null;
		onChange: (next: { from: string | null; to: string | null }) => void;
	}

	let { from, to, onChange }: Props = $props();

	function val(v: string): string | null {
		return v.trim() === '' ? null : v;
	}
</script>

<div class="flex flex-1 items-center gap-2">
	<Input
		type="date"
		class="h-8"
		value={from ?? ''}
		oninput={(e) => onChange({ from: val((e.target as HTMLInputElement).value), to })}
	/>
	<span class="text-xs text-muted-foreground">–</span>
	<Input
		type="date"
		class="h-8"
		value={to ?? ''}
		oninput={(e) => onChange({ from, to: val((e.target as HTMLInputElement).value) })}
	/>
</div>
