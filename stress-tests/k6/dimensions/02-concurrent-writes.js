/**
 * Dimension 2: Concurrent Writes
 *
 * How many concurrent writers before "database is locked" errors?
 * Tests both simple writes (markers) and heavy writes (field values with hook cascades).
 */

import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { authenticateParticipant } from '../helpers/auth.js';
import { createRecord, loadManifest, dbLockedErrors } from '../helpers/api.js';

const manifest = loadManifest();

const markerWriteLatency = new Trend('marker_write_latency', true);
const fieldValueWriteLatency = new Trend('field_value_write_latency', true);
const writeErrors = new Counter('write_errors');

// Lower scale for writes -- SQLite serializes them
export const options = {
	scenarios: {
		simple_writes: {
			executor: 'ramping-vus',
			startVUs: 0,
			stages: [
				{ duration: '30s', target: 2 },
				{ duration: '10s', target: 0 },
				{ duration: '30s', target: 4 },
				{ duration: '10s', target: 0 },
				{ duration: '30s', target: 8 },
				{ duration: '10s', target: 0 },
				{ duration: '30s', target: 16 },
				{ duration: '10s', target: 0 },
				{ duration: '30s', target: 32 },
				{ duration: '10s', target: 0 },
				{ duration: '30s', target: 64 },
				{ duration: '10s', target: 0 },
			],
			exec: 'simpleWrites',
			tags: { test_type: 'simple_writes' },
		},
		heavy_writes: {
			executor: 'ramping-vus',
			startVUs: 0,
			startTime: '260s', // start after simple_writes finishes
			stages: [
				{ duration: '30s', target: 2 },
				{ duration: '10s', target: 0 },
				{ duration: '30s', target: 4 },
				{ duration: '10s', target: 0 },
				{ duration: '30s', target: 8 },
				{ duration: '10s', target: 0 },
				{ duration: '30s', target: 16 },
				{ duration: '10s', target: 0 },
				{ duration: '30s', target: 32 },
				{ duration: '10s', target: 0 },
				{ duration: '30s', target: 64 },
				{ duration: '10s', target: 0 },
			],
			exec: 'heavyWrites',
			tags: { test_type: 'heavy_writes' },
		},
	},
	thresholds: {
		'marker_write_latency': ['p(95)<3000'],
		'field_value_write_latency': ['p(95)<3000'],
		'http_req_failed': ['rate<0.05'],
	},
};

// Per-VU state
const vuState = {};

function getVuState() {
	if (!vuState[__VU]) {
		const vuIndex = (__VU - 1) % manifest.projects.length;
		const projectData = manifest.projects[vuIndex];
		const tokenIndex = (__VU - 1) % projectData.participantTokens.length;
		const token = authenticateParticipant(projectData.participantTokens[tokenIndex]);
		vuState[__VU] = { token, projectData, counter: 0 };
	}
	return vuState[__VU];
}

/**
 * Simple writes: create markers (minimal hook overhead)
 */
export function simpleWrites() {
	const state = getVuState();
	if (!state.token) { sleep(5); return; }

	state.counter++;
	const res = createRecord(state.token, 'markers', {
		project_id: state.projectData.projectId,
		category_id: state.projectData.categoryIds[0],
		title: `stress-k6-marker-${__VU}-${state.counter}`,
		location: {
			lat: 48.2 + Math.random() * 0.1,
			lon: 16.3 + Math.random() * 0.1
		}
	}, 'create_marker');

	markerWriteLatency.add(res.timings.duration);
	if (res.status !== 200) writeErrors.add(1);

	sleep(0.5);
}

/**
 * Heavy writes: create field values (triggers bumpLastActivity + automation evaluation)
 */
export function heavyWrites() {
	const state = getVuState();
	if (!state.token) { sleep(5); return; }

	state.counter++;

	// First create an instance to write field values against
	const instanceRes = createRecord(state.token, 'workflow_instances', {
		workflow_id: state.projectData.workflowId,
		current_stage_id: state.projectData.stageIds[0],
		status: 'active',
		created_by: state.projectData.participantIds[0],
		location: { lat: 48.2, lon: 16.3 },
		files: []
	}, 'create_instance');

	if (instanceRes.status !== 200) {
		writeErrors.add(1);
		sleep(1);
		return;
	}

	const instance = JSON.parse(instanceRes.body);

	// Create tool usage
	const toolUsageRes = createRecord(state.token, 'workflow_instance_tool_usage', {
		instance_id: instance.id,
		stage_id: state.projectData.stageIds[0],
		executed_by: state.projectData.participantIds[0],
		executed_at: new Date().toISOString(),
		metadata: { action: 'instance_created', created_fields: ['title', 'priority'] }
	}, 'create_tool_usage');

	if (toolUsageRes.status !== 200) {
		writeErrors.add(1);
		sleep(1);
		return;
	}

	const toolUsage = JSON.parse(toolUsageRes.body);

	// Create field values sequentially (each triggers hooks)
	const fields = [
		{ field_key: 'title', value: `stress-k6-title-${__VU}-${state.counter}` },
		{ field_key: 'priority', value: 'high' }, // triggers automation
		{ field_key: 'description', value: `stress-k6-desc-${__VU}-${state.counter}` },
		{ field_key: 'status', value: 'open' },
	];

	for (const field of fields) {
		const fvRes = createRecord(state.token, 'workflow_instance_field_values', {
			instance_id: instance.id,
			field_key: field.field_key,
			value: field.value,
			stage_id: state.projectData.stageIds[0],
			created_by_action: toolUsage.id
		}, 'create_field_value');

		fieldValueWriteLatency.add(fvRes.timings.duration);
		if (fvRes.status !== 200) writeErrors.add(1);
	}

	sleep(1);
}
