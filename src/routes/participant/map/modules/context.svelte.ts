/**
 * Map Selection Context
 *
 * Provides reactive selection state to all child components.
 * Uses Svelte 5 context API with typed accessors.
 */

import { getContext, setContext } from 'svelte';
import type { Selection, SelectionNavigation } from './types';

// =============================================================================
// Context Keys
// =============================================================================

const SELECTION_KEY = Symbol('map-selection');
const NAVIGATION_KEY = Symbol('map-selection-navigation');

// =============================================================================
// Selection Context
// =============================================================================

export interface SelectionContext {
	readonly selection: Selection;
	setSelection: (selection: Selection) => void;
	clearSelection: () => void;
}

/**
 * Set selection context at the provider level (map page)
 */
export function setMapSelectionContext(context: SelectionContext): void {
	setContext(SELECTION_KEY, context);
}

/**
 * Get selection context in child components
 */
export function getMapSelectionContext(): SelectionContext {
	const context = getContext<SelectionContext>(SELECTION_KEY);
	if (!context) {
		throw new Error('getMapSelectionContext must be used within a map selection provider');
	}
	return context;
}

// =============================================================================
// Navigation Context
// =============================================================================

export interface NavigationContext {
	readonly navigation: SelectionNavigation | null;
	goNext: () => void;
	goPrevious: () => void;
}

/**
 * Set navigation context at the provider level (map page)
 */
export function setMapNavigationContext(context: NavigationContext): void {
	setContext(NAVIGATION_KEY, context);
}

/**
 * Get navigation context in child components
 */
export function getMapNavigationContext(): NavigationContext {
	const context = getContext<NavigationContext>(NAVIGATION_KEY);
	if (!context) {
		throw new Error('getMapNavigationContext must be used within a map navigation provider');
	}
	return context;
}
