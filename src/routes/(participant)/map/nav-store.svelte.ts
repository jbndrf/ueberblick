import { writable } from 'svelte/store';

export interface MapNavCallbacks {
	onLayersClick?: () => void;
	onFiltersClick?: () => void;
	onLocationClick?: () => void;
	onToolsClick?: () => void;
	onWorkflowClick?: () => void;
	onParticipantToolsClick?: () => void;
	onRecentsClick?: () => void;
}

export const mapNavCallbacks = writable<MapNavCallbacks>({});

export interface MapNavBadges {
	participantToolsAvailable: boolean;
	participantToolsSoft: boolean;
	participantToolsHard: number;
}

export const mapNavBadges = writable<MapNavBadges>({
	participantToolsAvailable: false,
	participantToolsSoft: false,
	participantToolsHard: 0
});
