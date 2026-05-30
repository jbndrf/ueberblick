/**
 * Activity-feed logic shared by the participant workflow-instance detail module
 * and the admin per-instance detail page.
 *
 * Pure — no Svelte runes, no gateway, no i18n imports. i18n strings and label
 * resolvers are injected so the same logic serves both the participant- and
 * admin-namespaced message sets.
 */

export interface ToolUsageRecord {
	id: string;
	instance_id: string;
	stage_id?: string;
	executed_by: string;
	executed_at: string;
	metadata: {
		action:
			| 'instance_created'
			| 'form_fill'
			| 'edit'
			| 'admin_edit'
			| 'location_edit'
			| 'stage_transition'
			| 'protocol'
			| 'conflict_resolution';
		stage_name?: string;
		centroid?: { lat: number; lon: number } | null;
		geometry_type?: 'Point' | 'LineString' | 'Polygon' | null;
		// INVARIANT: tool_usage.metadata must NEVER carry raw field values.
		// Values live exclusively in workflow_field_values (gated row-by-row by
		// workflow_field_defs.view_roles). Only identifiers go here, so the
		// audit UI cannot leak role-restricted values through this collection.
		created_fields?: Array<{ field_key: string; field_name?: string }>;
		changes?: Array<{ field_key: string; field_name?: string }>;
		before?: { lat: number; lon: number } | null;
		after?: { lat: number; lon: number };
		from_stage_id?: string;
		from_stage_name?: string;
		to_stage_id?: string;
		to_stage_name?: string;
		connection_id?: string;
		protocol_entry_id?: string;
	};
	created: string;
	expand?: {
		executed_by?: { name?: string; email?: string };
	};
}

export interface ActivitySection {
	stageId: string;
	stageName: string;
	/** 1-based ordinal across visits to the same stage_id. */
	visitIndex: number;
	/** Total visits to the same stage_id across the whole timeline. */
	visitTotal: number;
	transitionEntry: ToolUsageRecord | null;
	entries: ToolUsageRecord[];
}

/**
 * Chronological stage-visit segmentation. Circular workflows visit the same
 * stage multiple times — each visit is its own segment so value rows recorded
 * during that visit appear under the correct visit, not collapsed into a single
 * per-stage bucket. Entries are bucketed by their own `stage_id` (the
 * destination for form_fills authored while advancing) rather than strictly by
 * executed_at, because form_fill is written a few ms BEFORE the stage_transition
 * it accompanies — strict time-window matching would mis-attribute it.
 */
export function buildActivitySections(
	toolUsageHistory: ToolUsageRecord[],
	currentStageId: string,
	getStageName: (stageId: string) => string | undefined
): ActivitySection[] {
	if (toolUsageHistory.length === 0) return [];

	const ascending = [...toolUsageHistory].sort((a, b) =>
		a.executed_at.localeCompare(b.executed_at)
	);

	type Segment = {
		stageId: string;
		openedAt: string;
		transition: ToolUsageRecord | null;
		entries: ToolUsageRecord[];
	};
	const segments: Segment[] = [];

	// Initial segment. Resolve its stage_id from the first transition's
	// from_stage_id if available; otherwise fall back to the earliest
	// non-transition entry's stage_id; otherwise the instance's current stage.
	const firstTransition = ascending.find((e) => e.metadata?.action === 'stage_transition');
	const initialStageId =
		(firstTransition?.metadata?.from_stage_id as string | undefined) ||
		(ascending.find((e) => e.metadata?.action !== 'stage_transition')?.stage_id as
			| string
			| undefined) ||
		currentStageId ||
		'';
	segments.push({
		stageId: initialStageId,
		openedAt: ascending[0]?.executed_at ?? new Date(0).toISOString(),
		transition: null,
		entries: []
	});

	for (const entry of ascending) {
		if (entry.metadata?.action === 'stage_transition') {
			const toStage =
				(entry.metadata.to_stage_id as string | undefined) ?? (entry.stage_id as string);
			if (!toStage) continue;
			segments.push({
				stageId: toStage,
				openedAt: entry.executed_at,
				transition: entry,
				entries: []
			});
		}
	}

	// Assign each non-transition entry to the segment whose stage_id matches AND
	// whose openedAt is closest to (but at most slightly later than) the entry's
	// executed_at. Handles form_fill-stamped-with-to-stage written just before
	// its transition.
	for (const entry of ascending) {
		if (entry.metadata?.action === 'stage_transition') continue;
		const entryStage = entry.stage_id as string | undefined;
		if (!entryStage) continue;
		const candidates = segments.filter((s) => s.stageId === entryStage);
		let target: Segment | null = null;
		if (candidates.length === 1) {
			target = candidates[0];
		} else if (candidates.length > 1) {
			const SKEW_MS = 5_000;
			const entryT = Date.parse(entry.executed_at);
			let best: Segment | null = null;
			let bestDelta = Infinity;
			for (const c of candidates) {
				const openedT = Date.parse(c.openedAt);
				if (openedT - entryT > SKEW_MS) continue; // segment opens too far in the future
				const delta = Math.abs(entryT - openedT);
				if (delta < bestDelta) {
					best = c;
					bestDelta = delta;
				}
			}
			target = best ?? candidates[candidates.length - 1];
		}
		if (target) target.entries.push(entry);
	}

	const filtered = segments.filter((s) => s.transition || s.entries.length > 0);

	const totalsByStage = new Map<string, number>();
	for (const s of filtered) totalsByStage.set(s.stageId, (totalsByStage.get(s.stageId) ?? 0) + 1);
	const seenByStage = new Map<string, number>();

	const sections: ActivitySection[] = filtered.map((s) => {
		const idx = (seenByStage.get(s.stageId) ?? 0) + 1;
		seenByStage.set(s.stageId, idx);
		return {
			stageId: s.stageId,
			stageName: getStageName(s.stageId) || s.stageId,
			visitIndex: idx,
			visitTotal: totalsByStage.get(s.stageId) ?? 1,
			transitionEntry: s.transition,
			// Newest-first within a segment.
			entries: [...s.entries].sort((a, b) => b.executed_at.localeCompare(a.executed_at))
		};
	});

	sections.reverse();
	return sections;
}

/** i18n strings for {@link getEntryLabel} — caller supplies its own namespace. */
export interface ActivityLabelStrings {
	action: string;
	created: string;
	dataRecorded: string;
	fieldFallback: string;
	updatedSuffix: string;
	adminUpdated: string;
	fieldsNoun: string;
	fieldsUpdated: string;
	locationUpdated: string;
	inspectionRecorded: string;
	conflictResolved: string;
}

/** Human-readable label for a single tool-usage entry. */
export function getEntryLabel(
	metadata: ToolUsageRecord['metadata'],
	opts: {
		resolveFieldLabel: (fieldKey: string) => string | undefined;
		t: ActivityLabelStrings;
	}
): string {
	const { resolveFieldLabel, t } = opts;
	if (!metadata?.action) return t.action;
	switch (metadata.action) {
		case 'instance_created':
			return t.created;
		case 'form_fill':
			return t.dataRecorded;
		case 'edit':
		case 'admin_edit': {
			if (metadata.changes?.length === 1) {
				const label = resolveFieldLabel(metadata.changes[0].field_key);
				return `${label || t.fieldFallback} ${t.updatedSuffix}`;
			}
			return metadata.action === 'admin_edit'
				? `${t.adminUpdated} ${metadata.changes?.length || ''} ${t.fieldsNoun}`
				: `${metadata.changes?.length || ''} ${t.fieldsUpdated}`;
		}
		case 'location_edit':
			return t.locationUpdated;
		case 'protocol':
			return t.inspectionRecorded;
		case 'conflict_resolution':
			return t.conflictResolved;
		default:
			return t.action;
	}
}
