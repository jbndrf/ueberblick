import http from 'k6/http';

const PB_URL = __ENV.PB_URL || 'http://localhost:8090';

/**
 * Authenticate as a participant using token-based auth.
 * Returns the auth token for subsequent requests.
 */
export function authenticateParticipant(participantToken) {
	const res = http.post(
		`${PB_URL}/api/collections/participants/auth-with-password`,
		JSON.stringify({
			identity: participantToken,
			password: participantToken
		}),
		{
			headers: { 'Content-Type': 'application/json' },
			tags: { name: 'auth' }
		}
	);

	if (res.status !== 200) {
		console.error(`Auth failed for token ${participantToken}: ${res.status} ${res.body}`);
		return null;
	}

	const body = JSON.parse(res.body);
	return body.token;
}

/**
 * Build auth headers for PocketBase API requests.
 */
export function authHeaders(token) {
	return {
		Authorization: token,
		'Content-Type': 'application/json'
	};
}

export { PB_URL };
