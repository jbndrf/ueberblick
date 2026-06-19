<script lang="ts">
	import { onDestroy } from 'svelte';
	import { BaseEdge, EdgeLabel, getBezierPath, type EdgeProps } from '@xyflow/svelte';
	import { Lock } from '@lucide/svelte';
	import { ToolBar } from '$lib/workflow-builder/components';
	import type { ConnectionEdgeData } from '$lib/workflow-builder';

	let {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		data: rawData,
		markerEnd,
		selected
	}: EdgeProps = $props();

	const data = rawData as ConnectionEdgeData | undefined;

	const tools = $derived(data?.tools ?? []);
	const isSelfLoop = $derived(data?.isSelfLoop ?? false);
	const curveOffset = $derived(data?.curveOffset ?? 0);
	const laneIndex = $derived(data?.laneIndex ?? 0);
	const laneCount = $derived(data?.laneCount ?? 1);

	// For self-loops, create a circular looping path above the node
	function getSelfLoopPath(sx: number, sy: number, tx: number, ty: number) {
		const loopExtent = 90;

		// Control points route the path through a loop above the node
		const cp1x = sx + loopExtent;
		const cp1y = sy - loopExtent;
		const cp2x = tx - loopExtent;
		const cp2y = ty - loopExtent;

		const path = `M ${sx},${sy} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${tx},${ty}`;
		const labelX = (sx + tx) / 2;
		const labelY = Math.min(sy, ty) - loopExtent + 15;

		return [path, labelX, labelY] as const;
	}

	// Build a quadratic bezier bulging perpendicular to the travel direction by
	// `offset` px (to the right of travel). Used to separate connections that
	// share the same stage pair — parallel duplicates fan out, and opposing
	// directions bulge to opposite screen sides since the perpendicular flips.
	function getOffsetPath(sx: number, sy: number, tx: number, ty: number, offset: number) {
		const mx = (sx + tx) / 2;
		const my = (sy + ty) / 2;
		const dx = tx - sx;
		const dy = ty - sy;
		const len = Math.sqrt(dx * dx + dy * dy) || 1;
		// Perpendicular offset to the right of travel direction
		const nx = (dy / len) * offset;
		const ny = (-dx / len) * offset;
		const cpx = mx + nx;
		const cpy = my + ny;
		// Label sits at the quadratic midpoint (t=0.5)
		const labelX = 0.25 * sx + 0.5 * cpx + 0.25 * tx;
		const labelY = 0.25 * sy + 0.5 * cpy + 0.25 * ty;
		const path = `M ${sx},${sy} Q ${cpx},${cpy} ${tx},${ty}`;
		return [path, labelX, labelY] as const;
	}

	// Calculate path and label position using $derived for synchronous updates
	const pathData = $derived.by(() => {
		if (isSelfLoop) {
			return getSelfLoopPath(sourceX, sourceY, targetX, targetY);
		} else if (curveOffset !== 0) {
			return getOffsetPath(sourceX, sourceY, targetX, targetY, curveOffset);
		} else {
			return getBezierPath({
				sourceX,
				sourceY,
				sourcePosition,
				targetX,
				targetY,
				targetPosition
			});
		}
	});

	const edgePath = $derived(pathData[0]);
	const labelX = $derived(pathData[1]);
	const labelY = $derived(pathData[2]);

	// Anchor for the midpoint toolbar. Parallel connections sharing a stage pair
	// are fanned out perpendicular (see curveOffset), but their toolbars would
	// still stack near the midpoint. Stagger each lane's toolbar *along* the
	// travel direction — where a toolbar is only ~one icon wide — so they sit in
	// sequence instead of on top of each other, while still riding their curve.
	const STAGGER_PX = 44;
	const toolbarAnchor = $derived.by((): { x: number; y: number } => {
		if (isSelfLoop) return { x: labelX, y: labelY };

		const dx = targetX - sourceX;
		const dy = targetY - sourceY;
		const len = Math.hypot(dx, dy) || 1;

		// Per-lane shift along the line, centered on the group. Clamped so the
		// toolbar never drifts onto the stage nodes at either end.
		let t = 0.5;
		if (laneCount > 1) {
			const centered = laneIndex - (laneCount - 1) / 2;
			t = Math.min(0.78, Math.max(0.22, 0.5 + (centered * STAGGER_PX) / len));
		}

		// Unit perpendicular, to the right of travel (matches getOffsetPath). The
		// quadratic's perpendicular displacement at parameter t is 2(1-t)·t·offset.
		const nx = dy / len;
		const ny = -dx / len;
		const perp = 2 * (1 - t) * t * curveOffset;

		return {
			x: sourceX + dx * t + nx * perp,
			y: sourceY + dy * t + ny * perp
		};
	});

	// Calculate line direction for tool bar orientation
	// Vertical/diagonal lines -> horizontal toolbar (tools beside +)
	// Horizontal lines -> vertical toolbar (tools above/below +)
	const toolbarDirection = $derived.by((): 'horizontal' | 'vertical' => {
		if (isSelfLoop) return 'horizontal'; // Self-loops always horizontal

		const dx = targetX - sourceX;
		const dy = targetY - sourceY;
		const angle = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));

		// If angle is between 45-135 degrees (mostly vertical), use horizontal toolbar
		// Otherwise (mostly horizontal), use vertical toolbar
		return angle > 45 && angle < 135 ? 'horizontal' : 'vertical';
	});

	// --- Cross-connection de-overlap -----------------------------------------
	// Register this toolbar's live anchor + estimated footprint with the shared
	// layout so toolbars from unrelated connections get nudged apart. The raw
	// anchor never reads the resolved offset, so there's no feedback loop.
	const layout = $derived(data?.toolbarLayout);

	// Rough toolbar footprint in flow px: one box per tool plus the add button,
	// laid out along the toolbar's orientation; the sentry badge widens the row.
	const toolbarBox = $derived.by((): { w: number; h: number } => {
		const ICON = 28;
		const GAP = 4;
		const PAD = 4;
		const count = tools.length + 1; // tools + the add button
		const long = count * ICON + (count - 1) * GAP + PAD * 2;
		const short = ICON + PAD * 2;
		let w = toolbarDirection === 'horizontal' ? long : short;
		const h = toolbarDirection === 'horizontal' ? short : long;
		if (data?.hasSentry) w += 22; // lock badge + gap sit to the left in the row
		return { w, h };
	});

	$effect(() => {
		layout?.register(id, {
			x: toolbarAnchor.x,
			y: toolbarAnchor.y,
			w: toolbarBox.w,
			h: toolbarBox.h
		});
	});
	onDestroy(() => layout?.unregister(id));

	// Apply the resolver's nudge (if any) to keep clear of other toolbars.
	const resolvedAnchor = $derived.by((): { x: number; y: number } => {
		const off = layout?.offsets.get(id);
		return off ? { x: toolbarAnchor.x + off.dx, y: toolbarAnchor.y + off.dy } : toolbarAnchor;
	});
</script>

<BaseEdge path={edgePath} {markerEnd} />

<!-- Tool bar positioned at edge midpoint, direction based on line angle -->
<EdgeLabel x={resolvedAnchor.x} y={resolvedAnchor.y}>
	<div class="edge-toolbar-container nodrag nopan" data-connection-id={id}>
		{#if data?.hasSentry}
			<!-- Guarded transition: sentry conditions restrict availability -->
			<span class="sentry-badge" title="Wächter aktiv">
				<Lock class="h-3 w-3" />
			</span>
		{/if}
		<ToolBar
			{tools}
			selectedToolId={data?.selectedToolId}
			onSelectTool={data?.onSelectTool}
			onAddTool={data?.onAddTool}
			direction={toolbarDirection}
		/>
	</div>
</EdgeLabel>

<style>
	.edge-toolbar-container {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
	}

	.sentry-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 9999px;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		color: hsl(32 95% 44%);
	}

	:global(.svelte-flow__edge-path) {
		stroke: #64748b;
		stroke-width: 2;
	}

	:global(.svelte-flow__edge.entry-edge .svelte-flow__edge-path) {
		stroke: rgb(34 197 94);
		stroke-dasharray: 5 5;
	}

	:global(.svelte-flow__edge.selected .svelte-flow__edge-path) {
		stroke: hsl(var(--primary));
		stroke-width: 2;
		stroke-dasharray: none;
	}

	:global(.svelte-flow__edge:not(.highlighted):not(.selected) .svelte-flow__edge-path) {
		transition: opacity 0.15s ease;
	}

	/* Dim non-highlighted edges when any edge has .highlighted */
	:global(
		.svelte-flow__edges:has(.highlighted)
			.svelte-flow__edge:not(.highlighted):not(.selected)
			.svelte-flow__edge-path
	) {
		opacity: 0.25;
	}
</style>
