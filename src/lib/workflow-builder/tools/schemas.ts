/**
 * Workflow Builder Tool Schemas
 *
 * Zod validation schemas for tool configurations.
 */

import { z } from 'zod';

// =============================================================================
// Progress Tool Config Schemas
// =============================================================================

export const formToolConfigSchema = z.object({
	toolType: z.literal('form'),
	formId: z.string().min(1, 'Form ID is required'),
	buttonLabel: z.string().min(1, 'Button label is required').max(50),
	submitButtonText: z.string().max(30).optional(),
	successMessage: z.string().max(200).optional()
});

// =============================================================================
// Stage Tool Config Schemas
// =============================================================================

export const editToolConfigSchema = z.object({
	toolType: z.literal('edit'),
	editableFields: z.array(z.string()).optional(),
	buttonLabel: z.string().min(1, 'Button label is required').max(50)
});

// =============================================================================
// Combined Tool Config Schema
// =============================================================================

export const toolConfigSchema = z.discriminatedUnion('toolType', [
	formToolConfigSchema,
	editToolConfigSchema
]);

// =============================================================================
// Tool Instance Schema
// =============================================================================

export const toolInstanceSchema = z.object({
	id: z.string().min(1),
	toolType: z.string().min(1),
	config: toolConfigSchema,
	order: z.number().int().min(0)
});

// =============================================================================
// Schema Type Exports
// =============================================================================

export type FormToolConfigInput = z.infer<typeof formToolConfigSchema>;
export type EditToolConfigInput = z.infer<typeof editToolConfigSchema>;
export type ToolConfigInput = z.infer<typeof toolConfigSchema>;
export type ToolInstanceInput = z.infer<typeof toolInstanceSchema>;

// =============================================================================
// Helper: Get schema for specific tool type
// =============================================================================

export function getToolConfigSchema(toolType: string): z.ZodType | undefined {
	const schemas: Record<string, z.ZodType> = {
		form: formToolConfigSchema,
		edit: editToolConfigSchema
	};
	return schemas[toolType];
}
