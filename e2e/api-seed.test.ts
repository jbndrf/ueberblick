import { test, expect } from '@playwright/test';
import { seedDatabase, cleanupProject } from './api-seed';

test.describe('API-based Database Seeding', () => {
	test('seed database via API', async () => {
		const result = await seedDatabase();

		expect(result.projectId).toBeTruthy();
		expect(result.roles).toHaveLength(3);
		expect(result.participants).toHaveLength(3);

		console.log('\n--- Seed Results ---');
		console.log(`Project ID: ${result.projectId}`);
		console.log('\nRoles:');
		result.roles.forEach(r => console.log(`  - ${r.name} (${r.id})`));
		console.log('\nParticipants:');
		result.participants.forEach(p => console.log(`  - ${p.name} (token: ${p.token})`));
	});
});
