/**
 * Dimension 1: Concurrent Reads
 *
 * How many participants can query simultaneously before reads degrade?
 * Tests list queries with role-filtered rules at increasing concurrency.
 */

import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { authenticateParticipant, authHeaders } from '../helpers/auth.js';
import { listRecords, loadManifest } from '../helpers/api.js';

const manifest = loadManifest();

// Custom metrics per collection
const markersLatency = new Trend('markers_latency', true);
const instancesLatency = new Trend('instances_latency', true);
const fieldValuesLatency = new Trend('field_values_latency', true);
const errors = new Counter('query_errors');

// Exponential scaling: 2, 4, 8, 16, 32, 64, 128, 256
export const options = {
	scenarios: {
		scale_test: {
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
				{ duration: '30s', target: 128 },
				{ duration: '10s', target: 0 },
				{ duration: '30s', target: 256 },
				{ duration: '10s', target: 0 },
			],
		},
	},
	thresholds: {
		http_req_failed: ['rate<0.05'],
		markers_latency: ['p(95)<3000'],
		instances_latency: ['p(95)<3000'],
		field_values_latency: ['p(95)<3000'],
	},
};

// Each VU authenticates once during setup
let authToken = null;
let projectData = null;

export default function () {
	// Authenticate on first iteration
	if (!authToken) {
		const vuIndex = (__VU - 1) % manifest.projects.length;
		projectData = manifest.projects[vuIndex % manifest.projects.length];
		const tokenIndex = (__VU - 1) % projectData.participantTokens.length;
		const participantToken = projectData.participantTokens[tokenIndex];
		authToken = authenticateParticipant(participantToken);
		if (!authToken) {
			console.error(`VU ${__VU}: Auth failed, skipping`);
			sleep(5);
			return;
		}
	}

	// Query 1: List markers (simple rule, ~1000 per project)
	const markersRes = listRecords(authToken, 'markers', {
		perPage: 200,
		filter: `project_id = "${projectData.projectId}"`
	});
	markersLatency.add(markersRes.timings.duration);
	if (markersRes.status !== 200) errors.add(1);

	sleep(0.5);

	// Query 2: List workflow instances (2-level traversal)
	const instancesRes = listRecords(authToken, 'workflow_instances', {
		perPage: 200,
		filter: `workflow_id.project_id = "${projectData.projectId}"`
	});
	instancesLatency.add(instancesRes.timings.duration);
	if (instancesRes.status !== 200) errors.add(1);

	sleep(0.5);

	// Query 3: List field values (3-level traversal, heaviest rule)
	const fvRes = listRecords(authToken, 'workflow_instance_field_values', {
		perPage: 200,
		filter: `instance_id.workflow_id.project_id = "${projectData.projectId}"`
	});
	fieldValuesLatency.add(fvRes.timings.duration);
	if (fvRes.status !== 200) errors.add(1);

	sleep(1);
}
