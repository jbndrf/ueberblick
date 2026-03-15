/**
 * Dimension 4: Realtime Fanout
 *
 * How does write latency degrade as more SSE listeners are connected?
 * Fixed write rate (1 write/sec), vary the number of connected listeners.
 *
 * Since k6 can't hold true SSE connections open while doing other work,
 * we measure the write-side impact: each SSE subscriber triggers PB to
 * evaluate list rules per subscriber. More subscribers = more rule evals per write.
 *
 * Listeners connect via SSE, subscribe, then hold the connection.
 * Writer creates workflow_instances at 1/sec and measures latency.
 */

import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { authenticateParticipant } from '../helpers/auth.js';
import { createRecord, loadManifest, PB_URL } from '../helpers/api.js';

const manifest = loadManifest();

const writeLatency = new Trend('fanout_write_latency', true);
const writeErrors = new Counter('fanout_write_errors');
const listenerConnected = new Counter('listeners_connected');
const listenerErrors = new Counter('listener_errors');

export const options = {
	scenarios: {
		// Constant writer: 1 VU doing 1 write/sec throughout the test
		writer: {
			executor: 'constant-vus',
			vus: 1,
			duration: '520s',
			exec: 'writer',
			tags: { role: 'writer' },
		},
		// Scaling listeners that connect and hold SSE
		listeners: {
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
			],
			exec: 'listener',
			tags: { role: 'listener' },
		},
	},
	thresholds: {
		'fanout_write_latency': ['p(95)<3000'],
		'http_req_failed': ['rate<0.05'],
	},
};

// Writer state
let writerToken = null;
let writerProjectData = null;

export function writer() {
	if (!writerToken) {
		writerProjectData = manifest.projects[0];
		writerToken = authenticateParticipant(writerProjectData.participantTokens[0]);
		if (!writerToken) { sleep(5); return; }
	}

	const res = createRecord(writerToken, 'workflow_instances', {
		workflow_id: writerProjectData.workflowId,
		current_stage_id: writerProjectData.stageIds[0],
		status: 'active',
		created_by: writerProjectData.participantIds[0],
		location: { lat: 48.2 + Math.random() * 0.01, lon: 16.3 + Math.random() * 0.01 },
	}, 'fanout_write');

	writeLatency.add(res.timings.duration);
	if (res.status !== 200) writeErrors.add(1);

	sleep(1);
}

// Listener: open SSE, subscribe, hold connection
export function listener() {
	const vuIndex = (__VU - 1) % manifest.projects.length;
	const projectData = manifest.projects[vuIndex];
	const tokenIndex = (__VU - 1) % projectData.participantTokens.length;
	const token = authenticateParticipant(projectData.participantTokens[tokenIndex]);

	if (!token) {
		listenerErrors.add(1);
		sleep(5);
		return;
	}

	// Open SSE connection (blocks for timeout duration, simulating held connection)
	const sseRes = http.get(`${PB_URL}/api/realtime`, {
		headers: {
			Authorization: token,
			Accept: 'text/event-stream',
		},
		tags: { name: 'sse_connect' },
		timeout: '28s',
	});

	const body = sseRes.body || '';
	const clientIdMatch = body.match(/"clientId"\s*:\s*"([^"]+)"/);

	if (!clientIdMatch) {
		listenerErrors.add(1);
		sleep(2);
		return;
	}

	// Subscribe
	const subRes = http.post(
		`${PB_URL}/api/realtime`,
		JSON.stringify({
			clientId: clientIdMatch[1],
			subscriptions: ['workflow_instances']
		}),
		{
			headers: {
				Authorization: token,
				'Content-Type': 'application/json',
			},
			tags: { name: 'sse_subscribe' },
		}
	);

	if (subRes.status === 204 || subRes.status === 200) {
		listenerConnected.add(1);
	} else {
		listenerErrors.add(1);
	}

	sleep(2);
}
