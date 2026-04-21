/**
 * Workflow Builder Tool Registry
 *
 * Central registry for all available workflow tools.
 * Tools register themselves here and the UI discovers them dynamically.
 *
 * Adding a new tool:
 * 1. Define the tool with toolType, displayName, description, icon, attachableTo, defaultColor
 * 2. Call toolRegistry.register(yourTool)
 * 3. The UI will automatically show it in the right places based on attachableTo
 */

import { FileText, Edit3, Tag, Zap, ClipboardList } from '@lucide/svelte';
import type { ToolDefinition, AttachmentTarget } from './types';

// =============================================================================
// Tool Registry Class
// =============================================================================

class ToolRegistry {
	private tools = new Map<string, ToolDefinition>();

	/**
	 * Register a tool definition
	 */
	register(definition: ToolDefinition): void {
		if (this.tools.has(definition.toolType)) {
			console.warn(`Tool "${definition.toolType}" is already registered. Overwriting.`);
		}
		this.tools.set(definition.toolType, definition);
	}

	/**
	 * Get a tool definition by type
	 */
	get(toolType: string): ToolDefinition | undefined {
		return this.tools.get(toolType);
	}

	/**
	 * Check if a tool type exists
	 */
	has(toolType: string): boolean {
		return this.tools.has(toolType);
	}

	/**
	 * Get all registered tools
	 */
	getAll(): ToolDefinition[] {
		return Array.from(this.tools.values());
	}

	/**
	 * Get tools that can be attached to a specific target
	 */
	getToolsFor(target: AttachmentTarget): ToolDefinition[] {
		return this.getAll().filter((t) => t.attachableTo.includes(target));
	}

	/**
	 * Get tools that can be attached to stages
	 */
	getStageTools(): ToolDefinition[] {
		return this.getToolsFor('stage');
	}

	/**
	 * Get tools that can be attached to connections
	 */
	getConnectionTools(): ToolDefinition[] {
		return this.getToolsFor('connection');
	}

	/**
	 * Get tool types as an array of strings
	 */
	getToolTypes(): string[] {
		return Array.from(this.tools.keys());
	}
}

// =============================================================================
// Global Registry Instance
// =============================================================================

export const toolRegistry = new ToolRegistry();

// =============================================================================
// Register Built-in Tools
// =============================================================================

// Form tool - collects data via form fields (connections only)
const formTool: ToolDefinition = {
	toolType: 'form',
	displayName: 'Form',
	description: 'Collect data via form fields',
	icon: FileText,
	attachableTo: ['connection'],
	defaultColor: '#3B82F6'
};

// Edit tool - allows editing existing fields
const editTool: ToolDefinition = {
	toolType: 'edit',
	displayName: 'Edit Fields',
	description: 'Allow editing existing fields',
	icon: Edit3,
	attachableTo: ['stage', 'connection', 'global'],
	defaultColor: '#6366F1'
};

// Field tag tool - semantic tagging for form fields (workflow-level)
const fieldTagTool: ToolDefinition = {
	toolType: 'field_tag',
	displayName: 'Field Tags',
	description: 'Tag form fields with semantic roles (e.g. filterable)',
	icon: Tag,
	attachableTo: ['global'],
	defaultColor: '#F59E0B'
};

// Automation tool - runs actions automatically based on triggers
const automationTool: ToolDefinition = {
	toolType: 'automation',
	displayName: 'Automation',
	description: 'Run actions on triggers like transitions or field changes',
	icon: Zap,
	attachableTo: ['global'],
	defaultColor: '#F59E0B'
};

// Protocol tool - recurring data collection with snapshot archiving
const protocolTool: ToolDefinition = {
	toolType: 'protocol',
	displayName: 'Protocol',
	description: 'Recurring data collection with snapshot archiving',
	icon: ClipboardList,
	attachableTo: ['stage', 'connection', 'global'],
	defaultColor: '#059669'
};

// Register the built-in tools
toolRegistry.register(formTool);
toolRegistry.register(editTool);
toolRegistry.register(protocolTool);
toolRegistry.register(fieldTagTool);
toolRegistry.register(automationTool);

// =============================================================================
// Export individual tool definitions for direct access if needed
// =============================================================================

export { formTool, editTool, protocolTool, fieldTagTool, automationTool };
