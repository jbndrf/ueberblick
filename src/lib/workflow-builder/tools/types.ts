/**
 * Workflow Builder Tool Types
 *
 * Defines the type system for workflow tools.
 * Tools specify where they can be attached via `attachableTo`:
 * - 'stage': Can be attached directly to a stage
 * - 'connection': Can be attached to a connection between stages
 */

import type { Component } from 'svelte';

// =============================================================================
// Attachment Target
// =============================================================================

export type AttachmentTarget = 'stage' | 'connection' | 'global';

// =============================================================================
// Tool Definition
// =============================================================================

export interface ToolDefinition {
	/** Unique identifier for the tool type */
	toolType: string;
	/** Human-readable display name */
	displayName: string;
	/** Short description for UI tooltip/help */
	description: string;
	/** Icon component from lucide-svelte */
	icon: Component<{ class?: string }>;
	/** Where this tool can be attached */
	attachableTo: AttachmentTarget[];
	/** Default button/icon color (hex) */
	defaultColor: string;
}

// =============================================================================
// Tool Configurations (Discriminated by toolType)
// =============================================================================

/**
 * Form tool config - collects data via form fields
 */
export interface FormToolConfig {
	toolType: 'form';
	/** Form ID to render (references tools_forms) */
	formId: string;
	/** Button label shown to participant */
	buttonLabel: string;
	/** Custom submit button text */
	submitButtonText?: string;
	/** Success message after submission */
	successMessage?: string;
}

/**
 * Edit tool config - allows editing existing fields
 */
export interface EditToolConfig {
	toolType: 'edit';
	/** Which fields can be edited (empty = all fields) */
	editableFields?: string[];
	/** Button label */
	buttonLabel: string;
}

/**
 * Automation tool config - runs actions on triggers
 */
export interface AutomationToolConfig {
	toolType: 'automation';
	/** Button label */
	buttonLabel: string;
}

/**
 * Protocol tool config - recurring data collection with snapshot
 */
export interface ProtocolToolConfig {
	toolType: 'protocol';
	/** Button label */
	buttonLabel: string;
}

/**
 * Field tag tool config - semantic tagging for form fields
 */
export interface FieldTagToolConfig {
	toolType: 'field_tag';
}

// =============================================================================
// Tool Config Union
// =============================================================================

export type ToolConfig = FormToolConfig | EditToolConfig | AutomationToolConfig | ProtocolToolConfig | FieldTagToolConfig;

// =============================================================================
// Type Guards
// =============================================================================

export function canAttachToStage(def: ToolDefinition): boolean {
	return def.attachableTo.includes('stage');
}

export function canAttachToConnection(def: ToolDefinition): boolean {
	return def.attachableTo.includes('connection');
}

export function isFormConfig(config: ToolConfig): config is FormToolConfig {
	return config.toolType === 'form';
}

export function isEditConfig(config: ToolConfig): config is EditToolConfig {
	return config.toolType === 'edit';
}

// =============================================================================
// Tool Instance (attached to a stage or connection)
// =============================================================================

/**
 * Represents an instance of a tool attached to a stage or connection.
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
