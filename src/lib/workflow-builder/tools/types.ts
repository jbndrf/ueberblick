/**
 * Workflow Builder Tool Types
 *
 * Defines the type system for workflow tools (actions).
 * Two categories:
 * - Progress Actions: Attached to edges, move workflow to next stage
 * - Stage Actions: Attached to nodes, modify data without progression
 */

import type { Component } from 'svelte';

// =============================================================================
// Tool Categories
// =============================================================================

export type ToolCategory = 'progress' | 'stage';

// =============================================================================
// Base Tool Definition
// =============================================================================

export interface BaseToolDefinition {
	/** Unique identifier for the tool type */
	toolType: string;
	/** Human-readable display name */
	displayName: string;
	/** Short description for UI tooltip/help */
	description: string;
	/** Icon component from lucide-svelte */
	icon: Component<{ class?: string }>;
	/** Category determines where tool appears and how it behaves */
	category: ToolCategory;
	/** Default button/icon color (hex) */
	defaultColor: string;
}

// =============================================================================
// Progress Tool Definition (Edge Tools)
// =============================================================================

/**
 * Progress tools belong to edges (connections) between stages.
 * They move the workflow from one stage to another.
 */
export interface ProgressToolDefinition extends BaseToolDefinition {
	category: 'progress';
}

// =============================================================================
// Stage Tool Definition (Node Tools)
// =============================================================================

/**
 * Stage tools belong to a single stage (node).
 * They modify data but don't progress the workflow.
 */
export interface StageToolDefinition extends BaseToolDefinition {
	category: 'stage';
}

// =============================================================================
// Tool Definition Union
// =============================================================================

export type ToolDefinition = ProgressToolDefinition | StageToolDefinition;

// =============================================================================
// Tool Configurations (Discriminated by toolType)
// =============================================================================

/**
 * Form tool config - progress action that shows a form
 */
export interface FormToolConfig {
	toolType: 'form';
	/** Form ID to render (references form_fields) */
	formId: string;
	/** Button label shown to participant */
	buttonLabel: string;
	/** Custom submit button text */
	submitButtonText?: string;
	/** Success message after submission */
	successMessage?: string;
}

/**
 * Edit tool config - stage action that allows editing fields
 */
export interface EditToolConfig {
	toolType: 'edit';
	/** Which fields can be edited (empty = all stage fields) */
	editableFields?: string[];
	/** Button label */
	buttonLabel: string;
}

// =============================================================================
// Tool Config Union
// =============================================================================

export type ToolConfig = FormToolConfig | EditToolConfig;

// =============================================================================
// Type Guards
// =============================================================================

export function isProgressTool(def: ToolDefinition): def is ProgressToolDefinition {
	return def.category === 'progress';
}

export function isStageTool(def: ToolDefinition): def is StageToolDefinition {
	return def.category === 'stage';
}

export function isFormConfig(config: ToolConfig): config is FormToolConfig {
	return config.toolType === 'form';
}

export function isEditConfig(config: ToolConfig): config is EditToolConfig {
	return config.toolType === 'edit';
}

// =============================================================================
// Tool Instance (attached to a stage or edge)
// =============================================================================

/**
 * Represents an instance of a tool attached to a stage or edge.
 * This is what gets stored and rendered.
 */
export interface ToolInstance {
	/** Unique ID for this tool instance */
	id: string;
	/** Tool type (references registry) */
	toolType: string;
	/** Tool-specific configuration */
	config: ToolConfig;
	/** Display order (for multiple tools on same target) */
	order: number;
}
