/**
 * Opt-in power features.
 *
 * The map UI keeps its default sheets minimal. Users turn on advanced tools
 * from Settings -> Preferences -> Advanced features, and the enabled ones
 * appear as additional tabs inside the relevant sheets.
 *
 * Source of truth: `participants.enabled_features` (JSON array of feature keys).
 * Mirrored into localStorage so the UI can render instantly on load and work
 * offline; any successful server write keeps the two in sync.
 */

import { getPocketBase } from '$lib/pocketbase';

export type FeatureKey =
	// Filter sheet
	| 'filter.field_filters'
	// Map tools sheet
	| 'tools.cluster';

export interface FeatureDefinition {
	key: FeatureKey;
	group: 'filter' | 'layers' | 'tools';
	/** Shippable in the current release. Non-shippable features are rendered as disabled. */
	available: boolean;
}

/**
 * Registry of every feature the UI knows about. Each slice flips `available`
 * to true as it lands. The order here is the order they render in.
 */
export const FEATURE_REGISTRY: readonly FeatureDefinition[] = [
	{ key: 'filter.field_filters', group: 'filter', available: true },
	{ key: 'tools.cluster', group: 'tools', available: true }
] as const;

const STORAGE_KEY = 'ueberblick_enabled_features';

let enabled = $state<Set<FeatureKey>>(new Set());
let participantId: string | null = null;

function readLocal(): Set<FeatureKey> {
	if (typeof window === 'undefined') return new Set();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw);
		return new Set(Array.isArray(parsed) ? (parsed as FeatureKey[]) : []);
	} catch {
		return new Set();
	}
}

function writeLocal(keys: Set<FeatureKey>): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
}

/**
 * Initialize the feature set. Call once per participant session from the
 * participant layout. `serverValue` is the raw `enabled_features` field off
 * the authed participant record (JSON array, or missing). Local cache wins
 * only if the server returned no value (offline load case).
 */
export function initEnabledFeatures(
	pid: string,
	serverValue: unknown
): void {
	participantId = pid;
	const fromServer: FeatureKey[] = Array.isArray(serverValue)
		? (serverValue as FeatureKey[])
		: [];
	const next = fromServer.length > 0 ? new Set(fromServer) : readLocal();
	enabled = next;
	writeLocal(next);
}

export function isFeatureEnabled(key: FeatureKey): boolean {
	return enabled.has(key);
}

export function getEnabledFeatures(): Set<FeatureKey> {
	return enabled;
}

/**
 * Toggle a feature. Optimistic: local state + cache flip immediately; server
 * write happens in the background. On failure the local flip stays — the next
 * successful write or fresh login will reconcile. This matches how other
 * participant prefs (e.g. full_local_copy) behave.
 */
export async function toggleFeature(key: FeatureKey, on: boolean): Promise<void> {
	const next = new Set(enabled);
	if (on) next.add(key);
	else next.delete(key);
	enabled = next;
	writeLocal(next);

	if (!participantId) return;
	try {
		const pb = getPocketBase();
		await pb.collection('participants').update(participantId, {
			enabled_features: [...next]
		});
	} catch (err) {
		console.warn('[enabled-features] server update failed, keeping local', err);
	}
}
