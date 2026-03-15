/**
 * Dimension 6: Initial Sync (Full Download)
 *
 * How many participants can do a full initial sync simultaneously?
 * Each VU downloads all synced collections, simulating a new participant
 * opening the app for the first time.
 */

import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { authenticateParticipant } from '../helpers/auth.js';
import { getFullList, loadManifest } from '../helpers/api.js';

const manifest = loadManifest();

const syncLatency = new Trend('full_sync_latency', true);
const markersDownload = new Trend('markers_download_latency', true);
const instancesDownload = new Trend('instances_download_latency', true);
const fieldValuesDownload = new Trend('field_values_download_latency', true);
const categoriesDownload = new Trend('categories_download_latency', true);
const stagesDownload = new Trend('stages_download_latency', true);
const syncErrors = new Counter('sync_errors');

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
			],
		},
	},
	thresholds: {
		'full_sync_latency': ['p(95)<10000'], // 10s for full sync
		'http_req_failed': ['rate<0.05'],
	},
};

export default function () {
	const vuIndex = (__VU - 1) % manifest.projects.length;
	const projectData = manifest.projects[vuIndex];
	const tokenIndex = (__VU - 1) % projectData.participantTokens.length;
	const token = authenticateParticipant(projectData.participantTokens[tokenIndex]);

	if (!token) {
		syncErrors.add(1);
		sleep(5);
		return;
	}

	const syncStart = Date.now();

	// Download all synced collections (simulates initial sync)

	// 1. Marker categories
	const catStart = Date.now();
	const catResponses = getFullList(token, 'marker_categories', {
		filter: `project_id = "${projectData.projectId}"`
	});
	categoriesDownload.add(Date.now() - catStart);
	for (const r of catResponses) { if (r.status !== 200) syncErrors.add(1); }

	// 2. Markers (heaviest -- ~1000 per project)
	const markersStart = Date.now();
	const markerResponses = getFullList(token, 'markers', {
		filter: `project_id = "${projectData.projectId}"`
	});
	markersDownload.add(Date.now() - markersStart);
	for (const r of markerResponses) { if (r.status !== 200) syncErrors.add(1); }

	// 3. Workflow stages
	const stagesStart = Date.now();
	const stageResponses = getFullList(token, 'workflow_stages', {
		filter: `workflow_id.project_id = "${projectData.projectId}"`
	});
	stagesDownload.add(Date.now() - stagesStart);
	for (const r of stageResponses) { if (r.status !== 200) syncErrors.add(1); }

	// 4. Workflow instances
	const instStart = Date.now();
	const instResponses = getFullList(token, 'workflow_instances', {
		filter: `workflow_id.project_id = "${projectData.projectId}"`
	});
	instancesDownload.add(Date.now() - instStart);
	for (const r of instResponses) { if (r.status !== 200) syncErrors.add(1); }

	// 5. Field values (heaviest rule)
	const fvStart = Date.now();
	const fvResponses = getFullList(token, 'workflow_instance_field_values', {
		filter: `instance_id.workflow_id.project_id = "${projectData.projectId}"`
	});
	fieldValuesDownload.add(Date.now() - fvStart);
	for (const r of fvResponses) { if (r.status !== 200) syncErrors.add(1); }

	syncLatency.add(Date.now() - syncStart);

	// Full sync is heavy, longer cooldown between iterations
	sleep(3);
}
