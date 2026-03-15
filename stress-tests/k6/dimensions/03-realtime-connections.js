/**
 * Dimension 3: Realtime Connections
 *
 * How many simultaneous SSE connections can PocketBase hold?
 * N VUs each open an SSE connection to /api/realtime and subscribe
 * to workflow_instances. No writes -- just measures connection stability.
 *
 * PocketBase realtime uses SSE (Server-Sent Events):
 * 1. GET /api/realtime -> receives PB_CONNECT with clientId
 * 2. POST /api/realtime with clientId + subscriptions
 * 3. Hold the SSE connection open
 *
 * k6 doesn't have native SSE support, so we simulate by:
 * - Establishing the SSE connection (GET with streaming)
 * - Subscribing via POST
 * - Holding the connection for the stage duration
 */

import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { authenticateParticipant } from '../helpers/auth.js';
import { loadManifest, PB_URL } from '../helpers/api.js';

const manifest = loadManifest();

const connectionErrors = new Counter('connection_errors');
const connectLatency = new Trend('sse_connect_latency', true);
const subscribeLatency = new Trend('sse_subscribe_latency', true);
const successfulConnections = new Counter('successful_connections');

// Scale: 2 -> 512
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
				{ duration: '30s', target: 512 },
				{ duration: '10s', target: 0 },
			],
		},
	},
	thresholds: {
		connection_errors: ['count<50'],
	},
};

export default function () {
	const vuIndex = (__VU - 1) % manifest.projects.length;
	const projectData = manifest.projects[vuIndex];
	const tokenIndex = (__VU - 1) % projectData.participantTokens.length;
	const authToken = authenticateParticipant(projectData.participantTokens[tokenIndex]);

	if (!authToken) {
		connectionErrors.add(1);
		sleep(5);
		return;
	}

	// Step 1: Open SSE connection and get clientId
	const startTime = Date.now();
	const sseRes = http.get(`${PB_URL}/api/realtime`, {
		headers: {
			Authorization: authToken,
			Accept: 'text/event-stream',
		},
		tags: { name: 'sse_connect' },
		timeout: '28s', // hold connection for most of the stage
	});

	connectLatency.add(Date.now() - startTime);

	// Parse clientId from the SSE response
	const body = sseRes.body || '';
	const clientIdMatch = body.match(/"clientId"\s*:\s*"([^"]+)"/);

	if (!clientIdMatch) {
		connectionErrors.add(1);
		sleep(2);
		return;
	}

	const clientId = clientIdMatch[1];

	// Step 2: Subscribe to workflow_instances
	const subStart = Date.now();
	const subRes = http.post(
		`${PB_URL}/api/realtime`,
		JSON.stringify({
			clientId: clientId,
			subscriptions: ['workflow_instances']
		}),
		{
			headers: {
				Authorization: authToken,
				'Content-Type': 'application/json',
			},
			tags: { name: 'sse_subscribe' },
		}
	);

	subscribeLatency.add(Date.now() - subStart);

	if (subRes.status === 204 || subRes.status === 200) {
		successfulConnections.add(1);
	} else {
		connectionErrors.add(1);
	}

	sleep(2);
}
