import { test, expect } from '@playwright/test';
import { seedForst } from './api-seed-forst';

test.describe('Forstbetrieb Demo Seeding', () => {
	test('seed Forstbetrieb (two-layer risk map)', async () => {
		const result = await seedForst();

		expect(result.projectId).toBeTruthy();
		expect(result.roles).toHaveLength(2);
		expect(result.participants).toHaveLength(3);

		// Workflow A: Befallsueberwachung
		expect(result.workflowA.id).toBeTruthy();
		expect(result.workflowA.instances).toHaveLength(9);
		// 1 befallsindex (count) + 2 gesamtrisiko + 4 dringlichkeit + 1 auto-transition = 8
		expect(result.workflowA.automations).toHaveLength(8);
		expect(result.workflowA.fields.size).toBeGreaterThanOrEqual(6);

		// Workflow B: Kaefersichtungen
		expect(result.workflowB.id).toBeTruthy();
		expect(result.workflowB.instances).toHaveLength(6);
		// 3 stage progressions + 1 archive = 4
		expect(result.workflowB.automations).toHaveLength(4);

		console.log('\n--- Forstbetrieb Results ---');
		console.log(`Project ID: ${result.projectId}`);
		console.log(`Workflow A: ${result.workflowA.name} (${result.workflowA.id})`);
		console.log(`  Stages: ${Array.from(result.workflowA.stages.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}`);
		console.log(`  Instances: ${result.workflowA.instances.length}`);
		console.log(`  Automations: ${result.workflowA.automations.map((a) => a.name).join(', ')}`);
		console.log(`Workflow B: ${result.workflowB.name} (${result.workflowB.id})`);
		console.log(`  Stages: ${Array.from(result.workflowB.stages.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}`);
		console.log(`  Instances: ${result.workflowB.instances.length}`);
		console.log(`  Automations: ${result.workflowB.automations.map((a) => a.name).join(', ')}`);
		console.log('\nParticipant tokens:');
		result.participants.forEach((p) => console.log(`  ${p.name}: ${p.token}`));
	});
});
