import { test, expect } from '@playwright/test';
import { seedGebaeude } from './api-seed-gebaeude';

test.describe('Gebaeudemanagement Demo Seeding', () => {
	test('seed Gebaeudemanagement (3 buildings, DIN 31051)', async () => {
		const result = await seedGebaeude();

		expect(result.projectId).toBeTruthy();
		expect(result.roles).toHaveLength(2);
		expect(result.participants).toHaveLength(3);
		expect(result.workflows).toHaveLength(3);

		const expectedNames = ['Rathaus', 'Schule', 'Sporthalle'];
		for (let i = 0; i < result.workflows.length; i++) {
			const wf = result.workflows[i];
			expect(wf.name).toBe(expectedNames[i]);
			expect(wf.instances).toHaveLength(6);
			// 3 index triggers + 4 klasse classifiers + 1 sanitaer override = 8
			expect(wf.automations).toHaveLength(8);
			expect(wf.stages.size).toBe(4);
		}

		console.log('\n--- Gebaeudemanagement Results ---');
		console.log(`Project ID: ${result.projectId}`);
		result.workflows.forEach((wf) => {
			console.log(`\n${wf.name} (${wf.id}):`);
			console.log(`  Stages: ${Array.from(wf.stages.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}`);
			console.log(`  Rooms: ${wf.instances.map((i) => i.raumnummer).join(', ')}`);
			console.log(`  Automations: ${wf.automations.map((a) => a.name).join(', ')}`);
		});
		console.log('\nParticipant tokens:');
		result.participants.forEach((p) => console.log(`  ${p.name}: ${p.token}`));
	});
});
