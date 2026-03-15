/**
 * Dimension 5: Rule Complexity Comparison
 *
 * How much do nested rules cost compared to simple rules?
 * Fixed 16 VUs, comparing query times across collections with different
 * rule complexity levels.
 */

import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { authenticateParticipant } from '../helpers/auth.js';
import { listRecords, loadManifest } from '../helpers/api.js';

const manifest = loadManifest();

// Per-collection metrics
const simpleRuleLatency = new Trend('simple_rule_latency', true);    // markers
const mediumRuleLatency = new Trend('medium_rule_latency', true);    // workflow_instances
const heavyRuleLatency = new Trend('heavy_rule_latency', true);      // field_values
const stagesLatency = new Trend('stages_latency', true);             // stages (baseline)
const errors = new Counter('rule_test_errors');

export const options = {
	scenarios: {
		rule_comparison: {
			executor: 'constant-vus',
			vus: 16,
			duration: '120s',
		},
	},
	thresholds: {
		'http_req_failed': ['rate<0.05'],
	},
};

let authToken = null;
let projectData = null;

export default function () {
	if (!authToken) {
		const vuIndex = (__VU - 1) % manifest.projects.length;
		projectData = manifest.projects[vuIndex];
		const tokenIndex = (__VU - 1) % projectData.participantTokens.length;
		authToken = authenticateParticipant(projectData.participantTokens[tokenIndex]);
		if (!authToken) { sleep(5); return; }
	}

	// Baseline: workflow_stages (simple project membership check)
	const stagesRes = listRecords(authToken, 'workflow_stages', {
		perPage: 200,
		filter: `workflow_id.project_id = "${projectData.projectId}"`
	});
	stagesLatency.add(stagesRes.timings.duration);
	if (stagesRes.status !== 200) errors.add(1);

	sleep(0.2);

	// Simple rule: markers (project_id + category role check)
	const markersRes = listRecords(authToken, 'markers', {
		perPage: 200,
		filter: `project_id = "${projectData.projectId}"`
	});
	simpleRuleLatency.add(markersRes.timings.duration);
	if (markersRes.status !== 200) errors.add(1);

	sleep(0.2);

	// Medium rule: workflow_instances (2-level traversal + role check)
	const instancesRes = listRecords(authToken, 'workflow_instances', {
		perPage: 200,
		filter: `workflow_id.project_id = "${projectData.projectId}"`
	});
	mediumRuleLatency.add(instancesRes.timings.duration);
	if (instancesRes.status !== 200) errors.add(1);

	sleep(0.2);

	// Heavy rule: workflow_instance_field_values (3-level traversal + stage visibility)
	const fvRes = listRecords(authToken, 'workflow_instance_field_values', {
		perPage: 200,
		filter: `instance_id.workflow_id.project_id = "${projectData.projectId}"`
	});
	heavyRuleLatency.add(fvRes.timings.duration);
	if (fvRes.status !== 200) errors.add(1);

	sleep(0.5);
}
