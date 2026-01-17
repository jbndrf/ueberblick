/**
 * Participant Gateway Context
 *
 * Provides the participant gateway via Svelte context for use across the app.
 * Initialize in the layout, consume in pages/components.
 */

import { getContext, setContext } from 'svelte';
import { createParticipantGateway, type ParticipantGateway } from './gateway.svelte';
import { setupPersistence, saveReferenceData, loadReferenceData } from './persistence.svelte';
import type {
	Workflow,
	WorkflowStage,
	WorkflowConnection,
	MarkerCategory,
	Role
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
