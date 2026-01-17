import { writable } from 'svelte/store';

export interface MapNavCallbacks {
	onLayersClick?: () => void;
	onFiltersClick?: () => void;
	onLocationClick?: () => void;
	onToolsClick?: () => void;
	onWorkflowClick?: () => void;
}

export const mapNavCallbacks = writable<MapNavCallbacks>({});
