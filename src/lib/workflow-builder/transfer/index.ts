/**
 * Workflow-builder transfer layer — copy/paste & import/export of workflow
 * "parts" as label-based, LLM-authorable YAML/JSON. See part-schema.ts for the
 * design principle (parts mirror the builder's logical model, not the DB).
 */
export {
	PART_VERSION,
	formPartSchema,
	formPartFieldSchema,
	anyPartSchema,
	workflowPartSchema,
	parseFormPart,
	parseWorkflowPart,
	type FormPart,
	type FormPartField,
	type WorkflowPart,
	type WorkflowFieldDefPart,
	type WorkflowStagePart,
	type WorkflowConnectionPart,
	type WorkflowFormPart,
	type WorkflowEditToolPart,
	type WorkflowProtocolToolPart,
	type WorkflowAutomationPart,
	type WorkflowFieldTagPart,
	type AnyPart
} from './part-schema';

export { buildFormPart, type LabelResolver } from './export-part';

export {
	importFormPart,
	remapLogicLabels,
	type FormTarget,
	type ImportWarning,
	type FormImportResult
} from './import-part';

export {
	buildWorkflowPart,
	applyWorkflowPart,
	type WorkflowApplyResult,
	type Role
} from './workflow-part';

export { stringifyPart, parsePart, parseFormPartText, parseWorkflowPartText } from './serde';
