import { test, expect } from '@playwright/test';
import { seedSicherheit } from './api-seed-sicherheit';

test.describe('Sicherheitsbegehung Demo Seeding', () => {
	test('seed Sicherheitsbegehung (Nohl risk matrix)', async () => {
		const result = await seedSicherheit();

		expect(result.projectId).toBeTruthy();
		expect(result.roles).toHaveLength(2);
		expect(result.participants).toHaveLength(3);

		// Workflow
		expect(result.workflow.id).toBeTruthy();
		expect(result.workflow.instances).toHaveLength(8);
		// 2 risikomasszahl triggers + 3 risikoklasse classifiers + 1 auto-transition = 6
		expect(result.workflow.automations).toHaveLength(6);
		expect(result.workflow.fields.size).toBeGreaterThanOrEqual(8);

		// Custom table
		expect(result.customTable.id).toBeTruthy();

		console.log('\n--- Sicherheitsbegehung Results ---');
		console.log(`Project ID: ${result.projectId}`);
		console.log(`Workflow: ${result.workflow.name} (${result.workflow.id})`);
		console.log(`  Stages: ${Array.from(result.workflow.stages.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}`);
		console.log(`  Instances: ${result.workflow.instances.length}`);
		console.log(`  Automations: ${result.workflow.automations.map((a) => a.name).join(', ')}`);
		console.log(`Custom Table: ${result.customTable.name} (${result.customTable.id})`);
		console.log('\nParticipant tokens:');
		result.participants.forEach((p) => console.log(`  ${p.name}: ${p.token}`));
	});
});
