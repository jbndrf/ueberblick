import { test, expect } from '@playwright/test';
import { seedDemoA, seedDemoB } from './api-seed-reinigung';

test.describe('Reinigung Demo Seeding', () => {
	test('seed Demo A (Tagesplan)', async () => {
		const result = await seedDemoA();

		expect(result.projectId).toBeTruthy();
		expect(result.workflows).toHaveLength(2);
		expect(result.participants).toHaveLength(2);

		for (const wf of result.workflows) {
			expect(wf.instances).toHaveLength(9);
			expect(wf.automations).toHaveLength(1);
			expect(wf.automations[0].name).toBe('Naechtlicher Reset');
		}

		console.log('\n--- Demo A Results ---');
		console.log(`Project ID: ${result.projectId}`);
		result.workflows.forEach((wf) => {
			console.log(`Workflow: ${wf.name} (${wf.id})`);
			console.log(`  Stages: Offen=${wf.stages.get('Offen')}, Erledigt=${wf.stages.get('Erledigt')}`);
			console.log(`  Rooms: ${wf.instances.map((i) => i.roomName).join(', ')}`);
			console.log(`  Automation: ${wf.automations[0].name} (${wf.automations[0].id})`);
		});
		console.log('\nParticipant tokens:');
		result.participants.forEach((p) => console.log(`  ${p.name}: ${p.token}`));
	});

	test('seed Demo B (Rhythmus)', async () => {
		const result = await seedDemoB();

		expect(result.projectId).toBeTruthy();
		expect(result.workflows).toHaveLength(2);
		expect(result.participants).toHaveLength(2);

		for (const wf of result.workflows) {
			expect(wf.instances).toHaveLength(9);
			expect(wf.automations).toHaveLength(3);
		}

		console.log('\n--- Demo B Results ---');
		console.log(`Project ID: ${result.projectId}`);
		result.workflows.forEach((wf) => {
			console.log(`Workflow: ${wf.name} (${wf.id})`);
			console.log(`  Stages: Offen=${wf.stages.get('Offen')}, Erledigt=${wf.stages.get('Erledigt')}`);
			console.log(`  Rooms: ${wf.instances.map((i) => i.roomName).join(', ')}`);
			wf.automations.forEach((a) => console.log(`  Automation: ${a.name} (${a.id})`));
		});
		console.log('\nParticipant tokens:');
		result.participants.forEach((p) => console.log(`  ${p.name}: ${p.token}`));
	});
});
