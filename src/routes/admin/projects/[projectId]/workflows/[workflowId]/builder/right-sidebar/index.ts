/**
 * Right Sidebar - Barrel Export
 *
 * The right sidebar is a flexible container that switches between views:
 * - PropertyView: Shown when a stage or connection is selected
 * - PreviewView: Shown when nothing is selected
 *
 * This structure makes it easy to add new views (e.g., DataFlowView, ValidationView)
 */

export { default as RightSidebar } from './RightSidebar.svelte';

// Re-export types from context for convenience
export type { SelectionContext, StageData, FormFieldData } from '../context-sidebar/context';
export { createContext, isStageContext, isActionContext, isFieldContext } from '../context-sidebar/context';
