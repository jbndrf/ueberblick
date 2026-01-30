/**
 * Participant Gateway Context
 *
 * Provides the participant gateway via Svelte context for use across the app.
 * Initialize in the layout, consume in pages/components.
 */

import { getContext, setContext } from 'svelte';
import { createParticipantGateway, type ParticipantGateway } from './gateway.svelte';
import { setupPersistence, saveReferenceData, loadReferenceData } from './persistence.svelte';
import { getDB } from './db';
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
