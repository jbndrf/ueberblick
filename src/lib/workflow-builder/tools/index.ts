/**
 * Workflow Builder Tools
 *
 * Barrel export for tool types, schemas, and registry.
 */

// Types
export type {
	AttachmentTarget,
	ToolDefinition,
	FormToolConfig,
	EditToolConfig,
	AutomationToolConfig,
	ProtocolToolConfig,
	FieldTagToolConfig,
	ToolConfig,
	ToolInstance
} from './types';

export { canAttachToStage, canAttachToConnection, isFormConfig, isEditConfig } from './types';

// Schemas
export {
	formToolConfigSchema,
	editToolConfigSchema,
	toolConfigSchema,
	toolInstanceSchema,
	getToolConfigSchema
} from './schemas';

export type {
	FormToolConfigInput,
	EditToolConfigInput,
	ToolConfigInput,
	ToolInstanceInput
} from './schemas';

// Registry
export { toolRegistry, formTool, editTool, protocolTool, fieldTagTool, automationTool } from './registry';
