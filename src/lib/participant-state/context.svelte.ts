/**
 * Participant Gateway Context
 *
 * Provides the participant gateway via Svelte context for use across the app.
 * Initialize in the layout, consume in pages/components.
 */

import { getContext, setContext } from 'svelte';
import { createParticipantGateway, type ParticipantGateway } from './gateway.svelte';
import { setupPersistence, saveReferenceData, loadReferenceData, clearAllData } from './persistence.svelte';
import {
	getDB,
	closeDB,
	setActiveParticipant,
	getActiveParticipantId,
	deleteParticipantDb,
	pruneOtherParticipantDbs,
	deleteLegacyDb
} from './db';
import type {
	Workflow,
	WorkflowStage,
	WorkflowConnection,
	MarkerCategory,
	Role,
	CachedSession
} from './types';

const GATEWAY_KEY = Symbol('participant-gateway');

// =============================================================================
// Context Functions
// =============================================================================

/**
 * Get the gateway from context.
 * Returns null if not initialized yet.
 */
export function getParticipantGateway(): ParticipantGateway | null {
	return getContext<ParticipantGateway | null>(GATEWAY_KEY) ?? null;
}

/**
 * Set the gateway in context.
 * Called from the layout after initialization.
 */
export function setParticipantGateway(gateway: ParticipantGateway): void {
	setContext(GATEWAY_KEY, gateway);
}

// =============================================================================
// Reference Data State (read-only data from server)
// =============================================================================

/**
 * Reference data loaded from IndexedDB or server
 */
export interface ReferenceData {
	workflows: Workflow[];
	workflowStages: WorkflowStage[];
	workflowConnections: WorkflowConnection[];
	markerCategories: MarkerCategory[];
	roles: Role[];
}

let referenceData = $state<ReferenceData>({
	workflows: [],
	workflowStages: [],
	workflowConnections: [],
	markerCategories: [],
	roles: []
});

/**
 * Get reactive reference data
 */
export function getReferenceData(): ReferenceData {
	return referenceData;
}

/**
 * Update reference data (call after loading from server or IndexedDB)
 */
export function setReferenceData(data: Partial<ReferenceData>): void {
	referenceData = { ...referenceData, ...data };
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the participant gateway and load data.
 * Call this in the layout when participant is authenticated.
 *
 * @param participantId - The authenticated participant's ID
 * @param projectId - The participant's project ID
 * @param serverData - Optional server data to seed the gateway (reference data)
 */
export async function initializeParticipantState(
	participantId: string,
	projectId: string,
	serverData?: {
		workflows?: Workflow[];
		workflowStages?: WorkflowStage[];
		workflowConnections?: WorkflowConnection[];
		markerCategories?: MarkerCategory[];
		roles?: Role[];
	}
): Promise<ParticipantGateway> {
	// Create the gateway
	const gateway = createParticipantGateway(participantId, projectId);

	// Initialize gateway (loads from IndexedDB)
	await gateway.init();

	// Set up auto-persistence
	setupPersistence(gateway);

	// Handle reference data
	if (serverData) {
		// Save server data to IndexedDB for offline use
		await saveReferenceData({
			workflows: serverData.workflows,
			workflowStages: serverData.workflowStages,
			workflowConnections: serverData.workflowConnections,
			markerCategories: serverData.markerCategories,
			roles: serverData.roles
		});

		// Update reactive reference data
		setReferenceData({
			workflows: serverData.workflows || [],
			workflowStages: serverData.workflowStages || [],
			workflowConnections: serverData.workflowConnections || [],
			markerCategories: serverData.markerCategories || [],
			roles: serverData.roles || []
		});
	} else {
		// Load from IndexedDB (offline mode)
		const cached = await loadReferenceData();
		setReferenceData({
			workflows: cached.workflows,
			workflowStages: cached.workflowStages,
			workflowConnections: cached.workflowConnections,
			markerCategories: cached.markerCategories,
			roles: cached.roles
		});
	}

	return gateway;
}

// =============================================================================
// Session Caching (for offline authentication)
// =============================================================================

const OFFLINE_GRACE_DAYS = 30;

/**
 * Cache participant session for offline use.
 * Call when user toggles to offline mode.
 */
export async function cacheSession(participant: {
	id: string;
	project_id: string;
	email?: string;
}): Promise<void> {
	const db = await getDB();
	await db.put('records', {
		_key: 'session/current',
		_collection: 'session',
		_status: 'unchanged',
		id: 'current',
		participantId: participant.id,
		projectId: participant.project_id,
		email: participant.email || '',
		cachedAt: new Date().toISOString(),
		expiresAt: new Date(Date.now() + OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
	});
}

/**
 * Get cached session for offline mode startup.
 * Returns null if no session or expired.
 */
export async function getCachedSession(): Promise<CachedSession | null> {
	const db = await getDB();
	const record = await db.get('records', 'session/current');
	if (!record) return null;

	const session = record as unknown as CachedSession & { expiresAt: string };
	if (new Date(session.expiresAt) < new Date()) {
		return null; // Expired
	}
	return session;
}

/**
 * Clear cached session.
 * Call on logout.
 */
export async function clearCachedSession(): Promise<void> {
	const db = await getDB();
	await db.delete('records', 'session/current');
}

// =============================================================================
// Full Local Copy Mode (replaces offline mode toggle)
// =============================================================================

const FULL_LOCAL_COPY_KEY = 'participant-full-local-copy';

/**
 * Persist "full local copy" mode preference to localStorage.
 * In full local copy mode, thumbnails of all images are cached in IndexedDB
 * for complete offline capability.
 */
export function setFullLocalCopyMode(enabled: boolean): void {
	if (typeof window === 'undefined') return;

	if (enabled) {
		localStorage.setItem(FULL_LOCAL_COPY_KEY, 'true');
	} else {
		localStorage.removeItem(FULL_LOCAL_COPY_KEY);
	}
}

/**
 * Get whether full local copy mode is enabled.
 */
export function getFullLocalCopyMode(): boolean {
	if (typeof window === 'undefined') return false;
	return localStorage.getItem(FULL_LOCAL_COPY_KEY) === 'true';
}

// =============================================================================
// Last-active participant hints (localStorage)
// =============================================================================

// These hints let the layout detect cross-reload changes *before* opening any
// IndexedDB: if stored id/role/project don't match `data.participant`, we know
// to switch to a different DB (or wipe the current one for role/project
// changes on the same participant) before any local-first read fires.

const LAST_PARTICIPANT_ID_KEY = 'ueberblick_last_participant_id';
const LAST_ROLE_ID_KEY = 'ueberblick_last_role_id';
const LAST_PROJECT_ID_KEY = 'ueberblick_last_project_id';

export interface LastActiveHints {
	participantId: string | null;
	roleIds: string[] | null;
	projectId: string | null;
}

export function getLastActiveHints(): LastActiveHints {
	if (typeof window === 'undefined') {
		return { participantId: null, roleIds: null, projectId: null };
	}
	try {
		const rawRoles = localStorage.getItem(LAST_ROLE_ID_KEY);
		let roleIds: string[] | null = null;
		if (rawRoles) {
			try {
				const parsed = JSON.parse(rawRoles);
				if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
					roleIds = parsed;
				}
				// Non-array (e.g. legacy stringified array "id1,id2") -> treat as
				// unknown so the next reload doesn't trigger a spurious wipe.
			} catch {
				roleIds = null;
			}
		}
		return {
			participantId: localStorage.getItem(LAST_PARTICIPANT_ID_KEY),
			roleIds,
			projectId: localStorage.getItem(LAST_PROJECT_ID_KEY)
		};
	} catch {
		return { participantId: null, roleIds: null, projectId: null };
	}
}

export function writeLastActiveHints(hints: LastActiveHints): void {
	if (typeof window === 'undefined') return;
	try {
		if (hints.participantId) localStorage.setItem(LAST_PARTICIPANT_ID_KEY, hints.participantId);
		else localStorage.removeItem(LAST_PARTICIPANT_ID_KEY);
		if (hints.roleIds && hints.roleIds.length > 0) {
			localStorage.setItem(LAST_ROLE_ID_KEY, JSON.stringify([...hints.roleIds].sort()));
		} else {
			localStorage.removeItem(LAST_ROLE_ID_KEY);
		}
		if (hints.projectId) localStorage.setItem(LAST_PROJECT_ID_KEY, hints.projectId);
		else localStorage.removeItem(LAST_PROJECT_ID_KEY);
	} catch { /* storage disabled */ }
}

export function clearLastActiveHints(): void {
	writeLastActiveHints({ participantId: null, roleIds: null, projectId: null });
}

export function roleIdsEqual(a: string[] | null, b: string[] | null): boolean {
	if (a === b) return true;
	if (!a || !b || a.length !== b.length) return false;
	const sa = [...a].sort();
	const sb = [...b].sort();
	return sa.every((v, i) => v === sb[i]);
}

// =============================================================================
// Active participant switching
// =============================================================================

/**
 * Switch the active IndexedDB to the given participant. Delegates to the db
 * module; exposed here so consumers import a single entry point.
 */
export function switchActiveParticipant(participantId: string | null): void {
	setActiveParticipant(participantId);
}

/**
 * Legacy-database cleanup: deletes the pre-namespacing `participant-state`
 * database if it still exists on this origin. Safe to call on every boot.
 */
export async function cleanupLegacyDatabase(): Promise<void> {
	await deleteLegacyDb();
}

/**
 * Delete every participant-scoped DB on this origin except the given id.
 * Bounds storage usage when users log in as different participants over time.
 */
export async function pruneStaleParticipantDbs(keepParticipantId: string): Promise<void> {
	await pruneOtherParticipantDbs(keepParticipantId);
}

// =============================================================================
// Full Session Reset (call on logout)
// =============================================================================

/**
 * Nuclear cleanup for the *currently active* participant. Deletes that
 * participant's entire IndexedDB, forgets the last-active hints, and clears
 * the service worker page/api caches. Leaves other participants' DBs on this
 * origin untouched -- use `pruneStaleParticipantDbs()` for that.
 *
 * Behaviour matrix:
 *  - "Logout" button on map screen: calls this, then fetches /participant/logout
 *  - In-session participant switch to a different id: layout calls this on the
 *    *old* participant's DB before switching
 *  - Role/project change detected on reload: calls this to drop role-gated
 *    stale data for the same participant
 */
export async function resetAllParticipantState(): Promise<void> {
	const id = getActiveParticipantId();

	// 1. Drop the in-memory DB handle and the id that points to it.
	closeDB();

	// 2. Delete the participant-scoped IndexedDB on disk. If no participant
	// was active (edge case: called before any login), fall back to the
	// clear-stores path which is a no-op on an unopened DB.
	if (id) {
		try { await deleteParticipantDb(id); } catch (e) {
			console.error('Failed to delete participant DB:', e);
		}
	} else {
		try { await clearAllData(); } catch { /* nothing to clear */ }
	}

	// 3. Clear localStorage participant hints + the full-local-copy pref.
	if (typeof window !== 'undefined') {
		localStorage.removeItem(FULL_LOCAL_COPY_KEY);
	}
	clearLastActiveHints();

	// 4. Clear Service Worker caches (stale API responses and pages).
	if (typeof window !== 'undefined' && 'caches' in window) {
		await Promise.all([
			caches.delete('api-cache'),
			caches.delete('pages-cache'),
		]);
	}

	// 5. Forget the active participant so the next setActiveParticipant call
	// is treated as a switch (and fires the participant-switch listeners that
	// reset module-level caches like `cachedCollectionNames` in the gateway).
	setActiveParticipant(null);
}
