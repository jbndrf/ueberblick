// State management
export { WorkflowBuilderState, createWorkflowBuilderState } from './state.svelte';

// Field type definitions
export {
	FIELD_TYPES,
	fieldTypeIcons,
	fieldTypeLabels,
	getFieldType,
	type FieldTypeDefinition
} from './field-types';

// Types
export type {
	WorkflowStage,
	WorkflowConnection,
	ToolsForm,
	ToolsFormField,
	ToolsEdit,
	VisualConfig,
	TrackedStage,
	TrackedConnection,
	TrackedForm,
	TrackedFormField,
	TrackedEditTool,
	StageType,
	FieldType,
	ColumnPosition,
	ItemStatus,
	TrackedItem,
	EditMode,
	// Field option types
	FieldOption,
	TextValidation,
	NumberValidation,
	DateFieldOptions,
	FileFieldOptions,
	OptionsFieldOptions,
	MultipleChoiceValidation,
	SmartDropdownMapping,
	SmartDropdownFieldOptions,
	EntitySourceType,
	EntitySelectorOptions,
	// Field tag types
	TagMapping,
	ToolsFieldTag,
	TrackedFieldTag,
	// Automation types
	ToolsAutomation,
	AutomationStep,
	TrackedAutomation,
	TriggerType,
	TriggerConfig,
	TransitionTriggerConfig,
	FieldChangeTriggerConfig,
	ScheduledTriggerConfig,
	ConditionGroup,
	ConditionLeaf,
	ConditionOperator,
	AutomationAction
} from './types';

// Save
export { saveWorkflow, saveWorkflowMetadata } from './save';
export type { SaveResult } from './save';

// Utilities
export { generateId, arraysEqual, deepEqual } from './utils';

// Tool definitions (re-export from tools/)
export * from './tools';
