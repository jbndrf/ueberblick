/**
 * Inspector view registry: selection type → view component.
 *
 * Adding a new tool type = one state manager + one inspector view + one entry
 * here (+ a catalog row). Views receive no props — they read the current
 * selection and everything else from the builder context.
 */

import type { Component } from 'svelte';
import type { Selection } from '../builder-context.svelte';

import StageInspector from './views/StageInspector.svelte';
import ConnectionInspector from './views/ConnectionInspector.svelte';
import FormInspector from './views/FormInspector.svelte';
import EditToolInspector from './views/EditToolInspector.svelte';
import ProtocolToolInspector from './views/ProtocolToolInspector.svelte';
import AutomationInspector from './views/AutomationInspector.svelte';
import FieldDefInspector from './views/FieldDefInspector.svelte';
import FieldTagInspector from './views/FieldTagInspector.svelte';

export interface InspectorEntry {
	component: Component;
	/** Widens the sidebar (form grid needs space). */
	wide?: boolean;
}

export const inspectorRegistry: Record<Selection['type'], InspectorEntry> = {
	// No selection → the participant "default view" (data tabs only).
	none: { component: StageInspector, wide: true },
	stage: { component: StageInspector, wide: true },
	connection: { component: ConnectionInspector },
	form: { component: FormInspector, wide: true },
	editTool: { component: EditToolInspector, wide: true },
	protocolTool: { component: ProtocolToolInspector, wide: true },
	automation: { component: AutomationInspector },
	fieldDef: { component: FieldDefInspector },
	fieldTags: { component: FieldTagInspector }
};
