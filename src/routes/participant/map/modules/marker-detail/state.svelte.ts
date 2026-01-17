/**
 * MarkerDetailState
 *
 * Reactive state management for the MarkerDetailModule.
 * Loads marker data via gateway.
 */

import type { ParticipantGateway } from '$lib/participant-state/gateway.svelte';
import type {
	Marker,
	MarkerCategory,
	TabId,
	ActionButton,
	Photo,
	AuditEntry
} from '../types';

// =============================================================================
// State Class
// =============================================================================

export class MarkerDetailState {
	// Core identifiers
	private gateway: ParticipantGateway;
	private participantRoleId: string;
	markerId: string;

	// Loaded data (reactive)
	marker = $state<Marker | null>(null);
	category = $state<MarkerCategory | null>(null);

	// UI state
	activeTab = $state<TabId>('overview');
	isLoading = $state(true);
	loadError = $state<string | null>(null);

	// ==========================================================================
	// Derived State
	// ==========================================================================

	/** Photos - currently empty, will be populated when we have file fields */
	photos = $derived.by((): Photo[] => {
		// TODO: Extract photos from marker properties or linked data
		return [];
	});

	/** Audit trail - currently empty */
	auditEntries = $derived.by((): AuditEntry[] => {
		// TODO: Load from workflow_instance_tool_usage when we have instance linking
		return [];
	});

	/** Available actions - basic marker actions only for now */
	availableActions = $derived.by((): ActionButton[] => {
		// No actions for now - workflow actions will be added when we have instance linking
		return [];
	});

	// ==========================================================================
	// Constructor
	// ==========================================================================

	constructor(markerId: string, gateway: ParticipantGateway, participantRoleId: string) {
		this.markerId = markerId;
		this.gateway = gateway;
		this.participantRoleId = participantRoleId;
	}

	// ==========================================================================
	// Data Loading
	// ==========================================================================

	async load(): Promise<void> {
		this.isLoading = true;
		this.loadError = null;

		try {
			// Load marker with category expansion
			const marker = await this.gateway.collection('markers').getOne(this.markerId, {
				expand: 'category_id'
			});
			this.marker = marker as unknown as Marker;
			// Get expanded category from the result
			const expanded = (marker as Record<string, unknown>).expand as Record<string, unknown> | undefined;
			this.category = (expanded?.category_id as unknown as MarkerCategory) || null;

			this.isLoading = false;
		} catch (error) {
			this.loadError = error instanceof Error ? error.message : 'Failed to load marker details';
			this.isLoading = false;
		}
	}

	async refresh(): Promise<void> {
		await this.load();
	}

	// ==========================================================================
	// UI Actions
	// ==========================================================================

	setActiveTab(tab: TabId): void {
		this.activeTab = tab;
	}
}

// =============================================================================
// Factory Function
// =============================================================================

export function createMarkerDetailState(
	markerId: string,
	gateway: ParticipantGateway,
	participantRoleId: string
): MarkerDetailState {
	return new MarkerDetailState(markerId, gateway, participantRoleId);
}
