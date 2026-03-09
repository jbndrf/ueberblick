import { test, expect } from '@playwright/test';
import { seedBrandschutz } from './api-seed-brandschutz';

test.describe('Brandschutz Demo Seeding', () => {
	test('seed Brandschutz (escape route capacity + equipment)', async () => {
		const result = await seedBrandschutz();

		expect(result.projectId).toBeTruthy();
		expect(result.roles).toHaveLength(3);
		expect(result.participants).toHaveLength(3);

		// Workflow A: Fluchtweg-Kapazitaet
		expect(result.workflowFluchtweg.id).toBeTruthy();
		expect(result.workflowFluchtweg.instances).toHaveLength(6);
		// kapQuote + evakKap + rot + gelb + gruen = 5
		expect(result.workflowFluchtweg.automations).toHaveLength(5);

		// Workflow B: Brandschutzeinrichtungen
		expect(result.workflowEinrichtungen.id).toBeTruthy();
		expect(result.workflowEinrichtungen.instances).toHaveLength(6);

		console.log('\n--- Brandschutz Results ---');
		console.log(`Project ID: ${result.projectId}`);
		console.log(`Fluchtweg: ${result.workflowFluchtweg.name} (${result.workflowFluchtweg.id})`);
		console.log(`  Stages: ${Array.from(result.workflowFluchtweg.stages.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}`);
		console.log(`  Instances: ${result.workflowFluchtweg.instances.length}`);
		console.log(`  Automations: ${result.workflowFluchtweg.automations.map((a) => a.name).join(', ')}`);
		console.log(`Einrichtungen: ${result.workflowEinrichtungen.name} (${result.workflowEinrichtungen.id})`);
		console.log(`  Instances: ${result.workflowEinrichtungen.instances.length}`);
		console.log('\nParticipant tokens:');
		result.participants.forEach((p) => console.log(`  ${p.name}: ${p.token}`));
	});
});
