// Shared de-overlap registry for the midpoint toolbars rendered on action
// edges. Each ActionEdge registers its live anchor (flow coordinates) plus an
// estimated box size; the resolver nudges any overlapping toolbars apart so
// that connections from *different* stage pairs don't collide. Within-group
// parallel connections are already fanned/staggered (see ActionEdge), but
// unrelated edges whose midpoints happen to land near each other are only
// separated here.
//
// The registered anchors are a pure function of edge geometry and never read
// the resolved offsets, so there is no reactive feedback loop: register →
// offsets (derived) → each edge reads its offset for display.

export type ToolbarBox = { x: number; y: number; w: number; h: number };

/** Minimum empty gap kept between two toolbar boxes, in flow px. */
const MARGIN = 6;
/** Separation passes. A dozen is ample for the handful of edges in a workflow. */
const ITERATIONS = 12;

/**
 * Resolve per-id positional offsets that push overlapping boxes apart. Boxes
 * are separated along their axis of least penetration (the smaller nudge),
 * which keeps toolbars close to their true edge anchor.
 */
function resolveOffsets(boxes: Map<string, ToolbarBox>): Map<string, { dx: number; dy: number }> {
	const ids = [...boxes.keys()];
	const work = ids.map((id) => {
		const b = boxes.get(id)!;
		return { x: b.x, y: b.y, w: b.w, h: b.h };
	});

	for (let iter = 0; iter < ITERATIONS; iter++) {
		let moved = false;
		for (let a = 0; a < work.length; a++) {
			for (let b = a + 1; b < work.length; b++) {
				const A = work[a];
				const B = work[b];
				const minX = (A.w + B.w) / 2 + MARGIN;
				const minY = (A.h + B.h) / 2 + MARGIN;
				const dx = B.x - A.x;
				const dy = B.y - A.y;
				const overlapX = minX - Math.abs(dx);
				const overlapY = minY - Math.abs(dy);
				if (overlapX <= 0 || overlapY <= 0) continue; // AABBs clear on some axis

				if (overlapX < overlapY) {
					// Separate horizontally; split the correction between both boxes.
					const push = (overlapX / 2) * (dx < 0 ? -1 : 1);
					A.x -= push;
					B.x += push;
				} else {
					const push = (overlapY / 2) * (dy < 0 ? -1 : 1);
					A.y -= push;
					B.y += push;
				}
				moved = true;
			}
		}
		if (!moved) break;
	}

	const out = new Map<string, { dx: number; dy: number }>();
	ids.forEach((id, i) => {
		const b = boxes.get(id)!;
		out.set(id, { dx: work[i].x - b.x, dy: work[i].y - b.y });
	});
	return out;
}

export class ToolbarLayout {
	#boxes = $state<Map<string, ToolbarBox>>(new Map());

	/** Register/update an edge's toolbar box. No-op if nothing changed. */
	register(id: string, box: ToolbarBox): void {
		const prev = this.#boxes.get(id);
		if (prev && prev.x === box.x && prev.y === box.y && prev.w === box.w && prev.h === box.h) {
			return;
		}
		const next = new Map(this.#boxes);
		next.set(id, box);
		this.#boxes = next;
	}

	unregister(id: string): void {
		if (!this.#boxes.has(id)) return;
		const next = new Map(this.#boxes);
		next.delete(id);
		this.#boxes = next;
	}

	/** Resolved nudges keyed by edge id; pure function of the registered boxes. */
	readonly offsets = $derived.by(() => resolveOffsets(this.#boxes));
}
