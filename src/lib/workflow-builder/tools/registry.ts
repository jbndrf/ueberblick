/**
 * Workflow Builder Tool Registry
 *
 * Central registry for all available workflow tools.
 * Tools register themselves here and the UI discovers them dynamically.
 */

import { FileText, Edit3 } from 'lucide-svelte';
import type {
	ToolDefinition,
	ProgressToolDefinition,
	StageToolDefinition,
	ToolCategory
} from './types';

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
	 * Get tools by category
	 */
	getByCategory(category: ToolCategory): ToolDefinition[] {
		return this.getAll().filter((t) => t.category === category);
	}

	/**
	 * Get all progress tools (edge tools)
	 */
	getProgressTools(): ProgressToolDefinition[] {
		return this.getByCategory('progress') as ProgressToolDefinition[];
	}

	/**
	 * Get all stage tools (node tools)
	 */
	getStageTools(): StageToolDefinition[] {
		return this.getByCategory('stage') as StageToolDefinition[];
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

// Form tool - progress action that shows a form
const formTool: ProgressToolDefinition = {
	toolType: 'form',
	displayName: 'Form',
	description: 'Progress workflow when form is submitted',
	icon: FileText,
	category: 'progress',
	defaultColor: '#3B82F6'
};

// Edit tool - stage action that allows editing fields
const editTool: StageToolDefinition = {
	toolType: 'edit',
	displayName: 'Edit Fields',
	description: 'Edit stage fields without progressing',
	icon: Edit3,
	category: 'stage',
	defaultColor: '#6366F1'
};

// Register the built-in tools
toolRegistry.register(formTool);
toolRegistry.register(editTool);

// =============================================================================
// Export individual tool definitions for direct access if needed
// =============================================================================

export { formTool, editTool };
