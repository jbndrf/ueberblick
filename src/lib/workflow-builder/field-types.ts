/**
 * Shared Field Type Definitions
 *
 * Single source of truth for field type metadata (icons, labels, descriptions).
 * Used by FieldTypesPalette, FieldCard, and FieldConfigPanel.
 */

import type { ComponentType } from 'svelte';
import {
	Type,
	AlignLeft,
	Hash,
	Mail,
	Calendar,
	Upload,
	ChevronDown,
	List,
	Sparkles,
	Table
} from 'lucide-svelte';
import type { FieldType } from './types';

export interface FieldTypeDefinition {
	type: FieldType;
	label: string;
	description: string;
	icon: ComponentType;
}

export const FIELD_TYPES: FieldTypeDefinition[] = [
	{
		type: 'short_text',
		label: 'Short Text',
		description: 'Single line text input',
		icon: Type
	},
	{
		type: 'long_text',
		label: 'Long Text',
		description: 'Multi-line text area',
		icon: AlignLeft
	},
	{
		type: 'number',
		label: 'Number',
		description: 'Numeric input',
		icon: Hash
	},
	{
		type: 'email',
		label: 'Email',
		description: 'Email address input',
		icon: Mail
	},
	{
		type: 'date',
		label: 'Date',
		description: 'Date picker',
		icon: Calendar
	},
	{
		type: 'file',
		label: 'File',
		description: 'File upload',
		icon: Upload
	},
	{
		type: 'dropdown',
		label: 'Dropdown',
		description: 'Select from options',
		icon: ChevronDown
	},
	{
		type: 'multiple_choice',
		label: 'Multiple Choice',
		description: 'Select multiple options',
		icon: List
	},
	{
		type: 'smart_dropdown',
		label: 'Smart Dropdown',
		description: 'Dynamic options based on other fields',
		icon: Sparkles
	},
	{
		type: 'custom_table_selector',
		label: 'Custom Table',
		description: 'Select from a custom table',
		icon: Table
	}
];

// Derived lookup maps for convenience
export const fieldTypeIcons: Record<FieldType, ComponentType> = Object.fromEntries(
	FIELD_TYPES.map((f) => [f.type, f.icon])
) as Record<FieldType, ComponentType>;

export const fieldTypeLabels: Record<FieldType, string> = Object.fromEntries(
	FIELD_TYPES.map((f) => [f.type, f.label])
) as Record<FieldType, string>;

export function getFieldType(type: FieldType): FieldTypeDefinition | undefined {
	return FIELD_TYPES.find((f) => f.type === type);
}
