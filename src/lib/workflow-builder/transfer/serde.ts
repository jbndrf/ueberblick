/**
 * Text (de)serialization for transfer parts. YAML is the human/LLM-facing
 * format (comments, low punctuation, foldable). YAML is a superset of JSON, so
 * `parsePart` also accepts pasted JSON transparently.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
	anyPartSchema,
	formPartSchema,
	workflowPartSchema,
	type AnyPart,
	type FormPart,
	type WorkflowPart
} from './part-schema';

/** Serialize a part to YAML text. */
export function stringifyPart(part: AnyPart): string {
	return stringifyYaml(part, { indent: 2, lineWidth: 0 });
}

/** Parse + validate YAML/JSON text into a known part (throws on invalid shape). */
export function parsePart(text: string): AnyPart {
	const raw = parseYaml(text);
	return anyPartSchema.parse(raw);
}

/** Parse + validate specifically as a `form` part (throws otherwise). */
export function parseFormPartText(text: string): FormPart {
	const raw = parseYaml(text);
	return formPartSchema.parse(raw);
}

/** Parse + validate YAML/JSON text specifically as a `workflow` part. */
export function parseWorkflowPartText(text: string): WorkflowPart {
	const raw = parseYaml(text);
	return workflowPartSchema.parse(raw);
}
