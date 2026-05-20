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
	SentryClause,
	WorkflowFieldDef,
	FieldDisplayConfig,
	ToolsForm,
	FormPage,
	ProtocolLocalFieldDef,
	ToolsFormField,
	FormFieldConfig,
	ToolsEdit,
	VisualConfig,
	TrackedStage,
	TrackedConnection,
	TrackedForm,
	TrackedFormField,
	TrackedEditTool,
	TrackedProtocolTool,
	StageType,
	FieldType,
	ColumnPosition,
	ItemStatus,
	TrackedItem,
	EditMode,
	// Protocol tool types
	ToolsProtocol,
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
	TrackedFieldDef,
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
	AutomationAction,
	ExecutionMode,
	// XYFlow graph payloads
	StageData,
	ConnectionEdgeData,
	RegionInfo
} from './types';

// Value exports from types
export { DEFAULT_DATA_TAB } from './types';

// Utilities
export { generateId, arraysEqual, deepEqual } from './utils';

// Tool definitions (re-export from tools/)
export * from './tools';
