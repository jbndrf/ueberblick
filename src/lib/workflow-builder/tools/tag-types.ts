/**
 * Tag Type Registry
 *
 * Extensibility layer for field tags. Each tag type defines:
 * - What form field types it's compatible with
 * - What config it carries per mapping
 * - Display metadata for the admin UI
 *
 * To add a new tag type: add an entry to TAG_TYPE_DEFINITIONS below.
 */

import { z } from 'zod';
import type { FieldType } from '../types';

// =============================================================================
// Tag Type Definition
// =============================================================================

export interface TagTypeDefinition {
	/** Unique key for this tag type */
	tagType: string;
	/** Human-readable name */
	displayName: string;
	/** Description shown in admin UI */
	description: string;
	/** Which form field types can be tagged with this type */
	compatibleFieldTypes: FieldType[];
	/** Zod schema for per-mapping config validation */
	configSchema: z.ZodType;
	/** Factory for default config when a new mapping is created */
	defaultConfig: () => Record<string, unknown>;
}

// =============================================================================
// Filterable Tag Type
// =============================================================================

const filterableConfigSchema = z.object({
	filterBy: z.enum(['stage', 'field']).default('field')
});

export type FilterableConfig = z.infer<typeof filterableConfigSchema>;

const filterableTagType: TagTypeDefinition = {
	tagType: 'filterable',
	displayName: 'Filterable',
	description: 'Choose whether participants filter by stage or by a dropdown field on the map.',
	compatibleFieldTypes: ['dropdown', 'multiple_choice'],
	configSchema: filterableConfigSchema,
	defaultConfig: () => ({ filterBy: 'field' })
};

// =============================================================================
// Registry
// =============================================================================

const TAG_TYPE_DEFINITIONS: Record<string, TagTypeDefinition> = {
	filterable: filterableTagType
};

export function getAllTagTypes(): TagTypeDefinition[] {
	return Object.values(TAG_TYPE_DEFINITIONS);
}

export function getTagTypeDefinition(tagType: string): TagTypeDefinition | undefined {
	return TAG_TYPE_DEFINITIONS[tagType];
}
