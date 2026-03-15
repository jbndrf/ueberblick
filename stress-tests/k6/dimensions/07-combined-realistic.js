/**
 * Dimension 7: Combined Realistic
 *
 * Realistic mixed workload to find the usable participant count.
 * Each VU has an SSE connection and does a weighted mix:
 *   60% delta sync reads (updated > timestamp)
 *   25% field value creates
 *   10% marker creates
 *   5% stage transitions
 */

import { sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import ws from 'k6/ws';
import { authenticateParticipant } from '../helpers/auth.js';
import { listRecords, createRecord, updateRecord, loadManifest, PB_URL, dbLockedErrors } from '../helpers/api.js';

const manifest = loadManifest();

const deltaSyncLatency = new Trend('delta_sync_latency', true);
const fieldValueLatency = new Trend('fv_create_latency', true);
const markerCreateLatency = new Trend('marker_create_latency', true);
const transitionLatency = new Trend('transition_latency', true);
const actionErrors = new Counter('action_errors');

export const options = {
	scenarios: {
		scale_test: {
			executor: 'ramping-vus',
			startVUs: 0,
			stages: [
				{ duration: '45s', target: 2 },
				{ duration: '10s', target: 0 },
				{ duration: '45s', target: 4 },
				{ duration: '10s', target: 0 },
				{ duration: '45s', target: 8 },
				{ duration: '10s', target: 0 },
				{ duration: '45s', target: 16 },
				{ duration: '10s', target: 0 },
				{ duration: '45s', target: 32 },
				{ duration: '10s', target: 0 },
				{ duration: '45s', target: 64 },
				{ duration: '10s', target: 0 },
				{ duration: '45s', target: 128 },
				{ duration: '10s', target: 0 },
			],
		},
	},
	thresholds: {
		'http_req_failed': ['rate<0.05'],
		'delta_sync_latency': ['p(95)<3000'],
	},
};

const vuState = {};

function getState() {
	if (!vuState[__VU]) {
		const vuIndex = (__VU - 1) % manifest.projects.length;
		const projectData = manifest.projects[vuIndex];
		const tokenIndex = (__VU - 1) % projectData.participantTokens.length;
		const token = authenticateParticipant(projectData.participantTokens[tokenIndex]);
		vuState[__VU] = {
			token,
			projectData,
			counter: 0,
			lastSync: new Date(Date.now() - 60000).toISOString(), // 1 min ago
			instanceIds: [] // track created instances for transitions
		};
	}
	return vuState[__VU];
}

export default function () {
	const state = getState();
	if (!state.token) { sleep(5); return; }

	state.counter++;
	const roll = Math.random();

	if (roll < 0.60) {
		// Delta sync: read updated records since last sync
		deltaSyncRead(state);
	} else if (roll < 0.85) {
		// Field value create (heavy write with hooks)
		fieldValueCreate(state);
	} else if (roll < 0.95) {
		// Marker create (simple write)
		markerCreate(state);
	} else {
		// Stage transition
		stageTransition(state);
	}

	sleep(0.5 + Math.random() * 1); // 0.5-1.5s between actions
}

function deltaSyncRead(state) {
	const filter = `project_id = "${state.projectData.projectId}" && updated > "${state.lastSync}"`;

	// Sync markers
	const markersRes = listRecords(state.token, 'markers', {
		perPage: 200,
		filter,
		sort: '-updated'
	});
	deltaSyncLatency.add(markersRes.timings.duration);
	if (markersRes.status !== 200) actionErrors.add(1);

	// Sync instances
	const instFilter = `workflow_id.project_id = "${state.projectData.projectId}" && updated > "${state.lastSync}"`;
	const instRes = listRecords(state.token, 'workflow_instances', {
		perPage: 200,
		filter: instFilter,
		sort: '-updated'
	});
	deltaSyncLatency.add(instRes.timings.duration);
	if (instRes.status !== 200) actionErrors.add(1);

	// Sync field values
	const fvFilter = `instance_id.workflow_id.project_id = "${state.projectData.projectId}" && updated > "${state.lastSync}"`;
	const fvRes = listRecords(state.token, 'workflow_instance_field_values', {
		perPage: 200,
		filter: fvFilter,
		sort: '-updated'
	});
	deltaSyncLatency.add(fvRes.timings.duration);
	if (fvRes.status !== 200) actionErrors.add(1);

	state.lastSync = new Date().toISOString();
}

function fieldValueCreate(state) {
	// Create an instance first, then add field values
	const instanceRes = createRecord(state.token, 'workflow_instances', {
		workflow_id: state.projectData.workflowId,
		current_stage_id: state.projectData.stageIds[0],
		status: 'active',
		created_by: state.projectData.participantIds[0],
		location: { lat: 48.2 + Math.random() * 0.1, lon: 16.3 + Math.random() * 0.1 },
		files: []
	}, 'combined_create_instance');

	if (instanceRes.status !== 200) {
		actionErrors.add(1);
		return;
	}

	const instance = JSON.parse(instanceRes.body);
	state.instanceIds.push(instance.id);

	// Create tool usage
	const tuRes = createRecord(state.token, 'workflow_instance_tool_usage', {
		instance_id: instance.id,
		stage_id: state.projectData.stageIds[0],
		executed_by: state.projectData.participantIds[0],
		executed_at: new Date().toISOString(),
		metadata: { action: 'instance_created', created_fields: ['title'] }
	}, 'combined_create_tool_usage');

	if (tuRes.status !== 200) {
		actionErrors.add(1);
		return;
	}

	const toolUsage = JSON.parse(tuRes.body);

	// Add a field value (triggers hooks)
	const fvRes = createRecord(state.token, 'workflow_instance_field_values', {
		instance_id: instance.id,
		field_key: 'title',
		value: `stress-combined-${__VU}-${state.counter}`,
		stage_id: state.projectData.stageIds[0],
		created_by_action: toolUsage.id
	}, 'combined_create_field_value');

	fieldValueLatency.add(fvRes.timings.duration);
	if (fvRes.status !== 200) actionErrors.add(1);
}

function markerCreate(state) {
	const res = createRecord(state.token, 'markers', {
		project_id: state.projectData.projectId,
		category_id: state.projectData.categoryIds[0],
		title: `stress-combined-marker-${__VU}-${state.counter}`,
		location: {
			lat: 48.2 + Math.random() * 0.1,
			lon: 16.3 + Math.random() * 0.1
		}
	}, 'combined_create_marker');

	markerCreateLatency.add(res.timings.duration);
	if (res.status !== 200) actionErrors.add(1);
}

function stageTransition(state) {
	// Use a previously created instance, or skip if none available
	if (state.instanceIds.length === 0) {
		// Fallback: do a delta sync instead
		deltaSyncRead(state);
		return;
	}

	const instanceId = state.instanceIds.shift(); // consume one

	// Create transition tool_usage
	const tuRes = createRecord(state.token, 'workflow_instance_tool_usage', {
		instance_id: instanceId,
		stage_id: state.projectData.stageIds[0],
		executed_by: state.projectData.participantIds[0],
		executed_at: new Date().toISOString(),
		metadata: {
			action: 'stage_transition',
			from_stage_id: state.projectData.stageIds[0],
			to_stage_id: state.projectData.stageIds[1],
			connection_id: state.projectData.connectionIds[0]
		}
	}, 'combined_transition_tool_usage');

	if (tuRes.status !== 200) {
		actionErrors.add(1);
		return;
	}

	// Update instance stage (triggers on_transition hooks)
	const updateRes = updateRecord(
		state.token,
		'workflow_instances',
		instanceId,
		{ current_stage_id: state.projectData.stageIds[1] },
		'combined_transition_update'
	);

	transitionLatency.add(updateRes.timings.duration);
	if (updateRes.status !== 200) actionErrors.add(1);
}
