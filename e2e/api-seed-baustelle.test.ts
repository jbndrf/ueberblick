import { test, expect } from '@playwright/test';
import { seedBaustelle } from './api-seed-baustelle';

test.describe('Baustelle Demo Seeding', () => {
	test('seed Baustelle (blind double evaluation)', async () => {
		const result = await seedBaustelle();

		expect(result.projectId).toBeTruthy();
		expect(result.roles).toHaveLength(3);
		expect(result.participants).toHaveLength(3);

		// Workflow
		expect(result.workflow.id).toBeTruthy();
		expect(result.workflow.instances).toHaveLength(6);
		// diff + schnitt + strittig + einig + 3 prio + completed = 8
		expect(result.workflow.automations).toHaveLength(8);

		// Custom table
		expect(result.customTable.id).toBeTruthy();

		// Check blinding: stages have correct visible_to_roles
		const oueRoleId = result.roles.find((r) => r.name === 'Objektueberwacher')!.id;
		const piRoleId = result.roles.find((r) => r.name === 'Pruefingenieur')!.id;
		const bauleiterRoleId = result.roles.find((r) => r.name === 'Bauleiter')!.id;

		console.log('\n--- Baustelle Results ---');
		console.log(`Project ID: ${result.projectId}`);
		console.log(`Workflow: ${result.workflow.name} (${result.workflow.id})`);
		console.log(`  Stages: ${Array.from(result.workflow.stages.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}`);
		console.log(`  Instances: ${result.workflow.instances.length}`);
		console.log(`  Automations: ${result.workflow.automations.map((a) => a.name).join(', ')}`);
		console.log(`Roles: OUe=${oueRoleId}, PI=${piRoleId}, BL=${bauleiterRoleId}`);
		console.log(`Custom Table: ${result.customTable.name} (${result.customTable.id})`);
		console.log('\nParticipant tokens:');
		result.participants.forEach((p) => console.log(`  ${p.name}: ${p.token}`));
	});
});
