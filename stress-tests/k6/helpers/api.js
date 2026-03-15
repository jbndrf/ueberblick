import http from 'k6/http';
import { Counter } from 'k6/metrics';

const PB_URL = __ENV.PB_URL || 'http://localhost:8090';

export const dbLockedErrors = new Counter('db_locked_errors');

/**
 * List records from a collection with optional filter.
 */
export function listRecords(token, collection, params = {}) {
	const parts = [];
	if (params.filter) parts.push('filter=' + encodeURIComponent(params.filter));
	if (params.sort) parts.push('sort=' + encodeURIComponent(params.sort));
	if (params.perPage) parts.push('perPage=' + String(params.perPage));
	if (params.page) parts.push('page=' + String(params.page));
	if (params.expand) parts.push('expand=' + encodeURIComponent(params.expand));

	const qs = parts.join('&');
	const url = `${PB_URL}/api/collections/${collection}/records${qs ? '?' + qs : ''}`;

	const res = http.get(url, {
		headers: {
			Authorization: token,
			'Content-Type': 'application/json'
		},
		tags: { name: `list_${collection}`, collection }
	});

	if (res.status === 500 && res.body && res.body.includes('database is locked')) {
		dbLockedErrors.add(1);
	}

	return res;
}

/**
 * Get full list by paginating through all records.
 */
export function getFullList(token, collection, params = {}) {
	const perPage = params.perPage || 200;
	let page = 1;
	let totalItems = Infinity;
	const responses = [];

	while ((page - 1) * perPage < totalItems) {
		const res = listRecords(token, collection, { ...params, perPage, page });
		responses.push(res);

		if (res.status === 200) {
			const body = JSON.parse(res.body);
			totalItems = body.totalItems;
		} else {
			break;
		}
		page++;
	}

	return responses;
}

/**
 * Create a record in a collection.
 */
export function createRecord(token, collection, data, tagName) {
	const res = http.post(
		`${PB_URL}/api/collections/${collection}/records`,
		JSON.stringify(data),
		{
			headers: {
				Authorization: token,
				'Content-Type': 'application/json'
			},
			tags: { name: tagName || `create_${collection}`, collection }
		}
	);

	if (res.status === 500 && res.body && res.body.includes('database is locked')) {
		dbLockedErrors.add(1);
	}

	return res;
}

/**
 * Update a record in a collection.
 */
export function updateRecord(token, collection, recordId, data, tagName) {
	const res = http.patch(
		`${PB_URL}/api/collections/${collection}/records/${recordId}`,
		JSON.stringify(data),
		{
			headers: {
				Authorization: token,
				'Content-Type': 'application/json'
			},
			tags: { name: tagName || `update_${collection}`, collection }
		}
	);

	if (res.status === 500 && res.body && res.body.includes('database is locked')) {
		dbLockedErrors.add(1);
	}

	return res;
}

/**
 * Load the seed manifest and return project data.
 */
export function loadManifest() {
	const data = open('../../manifest.json');
	return JSON.parse(data);
}

/**
 * Get the current VU step from the ramping stages.
 * Maps elapsed time to the VU count for that stage.
 */
export function getCurrentStep(steps) {
	// k6 __VU gives us the VU number, and we can use the number of active VUs
	// to determine which step we're in. The tag is set per-request.
	// Since we can't easily determine the stage from within a VU,
	// we tag based on the target VU count from the scenario.
	return steps;
}

export { PB_URL };
