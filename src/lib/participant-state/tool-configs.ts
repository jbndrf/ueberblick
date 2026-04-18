/**
 * Generic per-participant tool configuration gateway.
 *
 * One PocketBase collection (`participant_tool_configs`) stores saved
 * configurations for any participant-side tool. Each tool picks its own
 * `tool_key` and owns the shape of the `config` JSON — callers pass a type
 * generic so consumers get typed rows without per-tool SDK code.
 */

import { getPocketBase } from '$lib/pocketbase';
import type { ToolConfigRecord } from './types';

const COLLECTION = 'participant_tool_configs';

function getParticipantId(): string {
	const pb = getPocketBase();
	const model = pb.authStore.model;
	if (!model || pb.authStore.isValid !== true) {
		throw new Error('[tool-configs] no authenticated participant');
	}
	return model.id;
}

/**
 * List all saved configs for a tool, filtered by project when given.
 * `projectId = null` returns only rows with no project (global configs).
 * `projectId = undefined` returns everything for this tool (global + any project).
 */
export async function listToolConfigs<T>(
	toolKey: string,
	projectId: string | null | undefined = undefined
): Promise<ToolConfigRecord<T>[]> {
	const pb = getPocketBase();
	const filters = [`tool_key = "${toolKey}"`];
	if (projectId === null) filters.push(`project_id = ""`);
	else if (typeof projectId === 'string')
		filters.push(`(project_id = "${projectId}" || project_id = "")`);

	const rows = await pb.collection(COLLECTION).getFullList({
		filter: filters.join(' && '),
		sort: 'sort_order,created'
	});
	return rows.map(rowToRecord<T>);
}

export async function createToolConfig<T>(
	toolKey: string,
	entry: {
		name: string;
		config: T;
		projectId: string | null;
		sort_order?: number;
	}
): Promise<ToolConfigRecord<T>> {
	const pb = getPocketBase();
	const row = await pb.collection(COLLECTION).create({
		participant_id: getParticipantId(),
		project_id: entry.projectId ?? '',
		tool_key: toolKey,
		name: entry.name,
		config: entry.config,
		sort_order: entry.sort_order ?? 0
	});
	return rowToRecord<T>(row);
}

export async function updateToolConfig<T>(
	id: string,
	patch: Partial<Pick<ToolConfigRecord<T>, 'name' | 'config' | 'sort_order'>>
): Promise<ToolConfigRecord<T>> {
	const pb = getPocketBase();
	const row = await pb.collection(COLLECTION).update(id, patch);
	return rowToRecord<T>(row);
}

export async function deleteToolConfig(id: string): Promise<void> {
	const pb = getPocketBase();
	await pb.collection(COLLECTION).delete(id);
}

function rowToRecord<T>(row: Record<string, unknown>): ToolConfigRecord<T> {
	return {
		id: String(row.id),
		participant_id: String(row.participant_id ?? ''),
		project_id: row.project_id ? String(row.project_id) : null,
		tool_key: String(row.tool_key ?? ''),
		name: String(row.name ?? ''),
		config: row.config as T,
		sort_order: Number(row.sort_order ?? 0),
		created: String(row.created ?? ''),
		updated: String(row.updated ?? '')
	};
}
