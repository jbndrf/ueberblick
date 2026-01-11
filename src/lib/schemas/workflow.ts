/**
 * Workflow Builder Zod Schemas
 *
 * Validation schemas for workflow builder forms using Zod.
 */

import { z } from 'zod';
import { toolConfigSchema } from '$lib/workflow-builder/tools';

/**
 * Workflow Schema
 */
export const workflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required').max(100),
  description: z.string().max(500).optional(),
  workflow_type: z.string().min(1, 'Workflow type is required'),
  marker_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
  is_active: z.boolean().default(true)
});

/**
 * Stage Schema
 */
export const stageSchema = z.object({
  stage_name: z.string().min(1, 'Stage name is required').max(100),
  stage_key: z.string().min(1, 'Stage key is required').max(50).regex(/^[a-z0-9_]+$/, 'Stage key must be lowercase alphanumeric with underscores'),
  stage_type: z.enum(['start', 'intermediate', 'end']),
  max_duration_hours: z.number().int().min(0).max(8760), // Max 1 year
  visible_to_roles: z.array(z.string()).default([]),
  position_x: z.number().default(100),
  position_y: z.number().default(100)
});

/**
 * Action Schema
 */
export const actionSchema = z.object({
  action_name: z.string().min(1, 'Action name is required').max(100),
  tool_type: z.string().min(1, 'Tool type is required'),
  tool_config: toolConfigSchema,
  button_label: z.string().min(1, 'Button label is required').max(50),
  button_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
  allowed_roles: z.array(z.string()).default([]),
  requires_confirmation: z.boolean().default(false),
  confirmation_message: z.string().max(200).optional(),
  action_order: z.number().int().min(0).default(0)
});

/**
 * Form Field Schema
 */
export const formFieldSchema = z.object({
  field_label: z.string().min(1, 'Field label is required').max(100),
  field_key: z.string().min(1, 'Field key is required').max(50).regex(/^[a-z0-9_]+$/, 'Field key must be lowercase alphanumeric with underscores'),
  field_type: z.enum(['short', 'long', 'multiple', 'dropdown', 'smart_dropdown', 'date', 'file', 'number', 'email']),
  is_required: z.boolean().default(false),
  placeholder: z.string().max(100).optional(),
  help_text: z.string().max(200).optional(),
  page: z.number().int().min(1).default(1),
  page_title: z.string().max(100).optional()
});

/**
 * Field Options Schema (for dropdown/multiple choice)
 */
export const fieldOptionsSchema = z.object({
  options: z.array(z.object({
    label: z.string().min(1),
    value: z.string().min(1)
  })).min(1, 'At least one option is required')
});

/**
 * Field Validation Schema
 */
export const fieldValidationSchema = z.object({
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(0).optional(),
  pattern: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  minSelections: z.number().int().min(0).optional(),
  maxSelections: z.number().int().min(0).optional(),
  fileTypes: z.array(z.string()).optional(),
  maxFileSize: z.number().int().min(0).optional()
}).optional();

/**
 * Smart Dropdown Mapping Schema
 */
export const smartDropdownMappingSchema = z.object({
  source_field_id: z.string().uuid(),
  mappings: z.array(z.object({
    source_value: z.string(),
    target_options: z.array(z.object({
      label: z.string(),
      value: z.string()
    }))
  }))
});

/**
 * Workflow Snapshot Schema
 */
export const workflowSnapshotSchema = z.object({
  name: z.string().min(1, 'Snapshot name is required').max(100),
  description: z.string().max(500).optional()
});
