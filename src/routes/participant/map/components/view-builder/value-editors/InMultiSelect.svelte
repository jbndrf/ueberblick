<script lang="ts">
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';

	interface Option {
		id: string;
		label: string;
		count?: number;
	}

	interface Props {
		options: Option[];
		values: string[];
		onChange: (next: string[]) => void;
		placeholder?: string;
	}

	let { options, values, onChange, placeholder = 'Pick values…' }: Props = $props();
</script>

<MobileMultiSelect
	options={options}
	selectedIds={values}
	getOptionId={(o) => o.id}
	getOptionLabel={(o) => o.label}
	getOptionDescription={(o) => (o.count != null ? `${o.count}` : undefined)}
	onSelectedIdsChange={onChange}
	placeholder={placeholder}
	summarizeMultiple
	disablePortal
/>
