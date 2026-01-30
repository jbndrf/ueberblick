/**
 * Persistence utilities for Participant Gateway
 *
 * With the generic gateway, persistence is handled automatically by the gateway itself.
 * This file provides utilities for reference data (read-only data from server).
 */

import { getDB, type CachedRecord } from './db';
import { revokeAllBlobUrls } from './file-cache';
import type { ParticipantGateway } from './gateway.svelte';
import type {
	Workflow,
	WorkflowStage,
	WorkflowConnection,
	ToolForm,
	ToolFormField,
	ToolEdit,
	MarkerCategory,
	Role
} from './types';

// =============================================================================
// Automatic Persistence via $effect
// =============================================================================

/**
 * Set up automatic persistence for a gateway.
 * With the generic gateway, persistence is handled automatically per-operation.
 * This function is kept for compatibility but does nothing.
 */
export function setupPersistence(_gateway: ParticipantGateway) {
	// Gateway now handles persistence automatically in each operation.
	// This function is kept for backward compatibility.
}

// =============================================================================
// Reference Data Persistence (read-only data downloaded from server)
// Using the generic 'records' store
// =============================================================================

/**
 * Save reference data to IndexedDB using the generic records store
 */
export async function saveReferenceData(data: {
	workflows?: Workflow[];
	workflowStages?: WorkflowStage[];
	workflowConnections?: WorkflowConnection[];
	toolsForms?: ToolForm[];
	toolsFormFields?: ToolFormField[];
	toolsEdit?: ToolEdit[];
	markerCategories?: MarkerCategory[];
	roles?: Role[];
}): Promise<void> {
	const db = await getDB();

	// Helper to save items to the generic records store
	async function saveItems(collection: string, items: { id: string }[] | undefined) {
		if (!items?.length) return;

		for (const item of items) {
			const record: CachedRecord = {
				...item,
				_key: `${collection}/${item.id}`,
				_collection: collection,
				_status: 'unchanged'
			};
			await db.put('records', record);
		}
	}

	await saveItems('workflows', data.workflows);
	await saveItems('workflow_stages', data.workflowStages);
	await saveItems('workflow_connections', data.workflowConnections);
	await saveItems('tools_forms', data.toolsForms);
	await saveItems('tools_form_fields', data.toolsFormFields);
	await saveItems('tools_edit', data.toolsEdit);
	await saveItems('marker_categories', data.markerCategories);
	await saveItems('roles', data.roles);
}

/**
 * Load reference data from IndexedDB using the generic records store
 */
export async function loadReferenceData(): Promise<{
	workflows: Workflow[];
	workflowStages: WorkflowStage[];
	workflowConnections: WorkflowConnection[];
	toolsForms: ToolForm[];
	toolsFormFields: ToolFormField[];
	toolsEdit: ToolEdit[];
	markerCategories: MarkerCategory[];
	roles: Role[];
}> {
	const db = await getDB();

	// Helper to load items from the generic records store
	async function loadItems<T>(collection: string): Promise<T[]> {
		const all = await db.getAllFromIndex('records', 'by_collection', collection);
		return all.filter((r) => r._status !== 'deleted') as unknown as T[];
	}

	const [
		workflows,
		workflowStages,
		workflowConnections,
		toolsForms,
		toolsFormFields,
		toolsEdit,
		markerCategories,
		roles
	] = await Promise.all([
		loadItems<Workflow>('workflows'),
		loadItems<WorkflowStage>('workflow_stages'),
		loadItems<WorkflowConnection>('workflow_connections'),
		loadItems<ToolForm>('tools_forms'),
		loadItems<ToolFormField>('tools_form_fields'),
		loadItems<ToolEdit>('tools_edit'),
		loadItems<MarkerCategory>('marker_categories'),
		loadItems<Role>('roles')
	]);

	return {
		workflows,
		workflowStages,
		workflowConnections,
		toolsForms,
		toolsFormFields,
		toolsEdit,
		markerCategories,
		roles
	};
}

// =============================================================================
// Clear Functions
// =============================================================================

/**
 * Clear all records from IndexedDB
 */
export async function clearAllRecords(): Promise<void> {
	const db = await getDB();
	await db.clear('records');
}

/**
 * Clear records for a specific collection
 */
export async function clearCollection(collection: string): Promise<void> {
	const db = await getDB();
	const records = await db.getAllFromIndex('records', 'by_collection', collection);

	for (const record of records) {
		await db.delete('records', record._key);
	}
}

/**
 * Clear all IndexedDB data (records, tiles, files, operation log, sync metadata, conflicts).
 */
export async function clearAllData(): Promise<void> {
	revokeAllBlobUrls();
	const db = await getDB();
	await Promise.all([
		db.clear('records'),
		db.clear('tiles'),
		db.clear('files'),
		db.clear('operation_log'),
		db.clear('sync_metadata'),
		db.clear('conflicts')
	]);
}
