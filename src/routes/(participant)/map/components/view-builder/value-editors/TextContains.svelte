<script lang="ts">
	import { Input } from '$lib/components/ui/input';

	interface Props {
		text: string;
		onChange: (next: string) => void;
		placeholder?: string;
	}

	let { text, onChange, placeholder = 'Text…' }: Props = $props();
</script>

<Input
	type="text"
	class="h-8 flex-1"
	value={text}
	{placeholder}
	oninput={(e) => onChange((e.target as HTMLInputElement).value)}
/>
