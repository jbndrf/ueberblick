<script lang="ts">
	import { Handle, Position, type NodeProps, type Node } from '@xyflow/svelte';
	import { LogIn } from 'lucide-svelte';

	type EntryMarkerData = {
		label: string;
		connectionId: string;
	};

	type EntryMarkerNodeType = Node<EntryMarkerData, 'entryMarker'>;

	let { data, selected }: NodeProps<EntryMarkerNodeType> = $props();
</script>

<div class="entry-marker" class:selected>
	<div class="entry-icon">
		<LogIn class="h-4 w-4" />
	</div>
	<span class="entry-label">{data.label}</span>

	<!-- Only source handle - entry markers only connect outward -->
	<Handle type="source" position={Position.Right} class="handle handle-source" />
</div>

<style>
	.entry-marker {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 1rem;
		background: linear-gradient(135deg, hsl(142 40% 95%) 0%, hsl(142 50% 92%) 100%);
		border: 2px dashed rgb(34 197 94 / 50%);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	:global(.dark) .entry-marker {
		background: linear-gradient(135deg, hsl(142 30% 15%) 0%, hsl(142 25% 12%) 100%);
		border-color: rgb(34 197 94 / 40%);
	}

	.entry-marker:hover {
		border-style: solid;
		border-color: rgb(34 197 94);
	}

	.entry-marker.selected {
		border-style: solid;
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15);
	}

	.entry-icon {
		color: rgb(34 197 94);
	}

	.entry-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	/* Handle styling */
	:global(.entry-marker .handle) {
		width: 10px;
		height: 10px;
		background: rgb(34 197 94);
		border: 2px solid white;
	}

	:global(.dark .entry-marker .handle) {
		border-color: oklch(0.2 0.04 260);
	}
</style>
