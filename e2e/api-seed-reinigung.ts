import PocketBase from 'pocketbase';
import {
	ADMIN_CREDENTIALS,
	REINIGUNG_PROJECT,
	REINIGUNG_ROLES,
	REINIGUNG_PARTICIPANTS,
	REINIGUNG_STAGES,
	REINIGUNG_CONNECTIONS,
	ROOM_COORDINATES,
	DEMO_A_WORKFLOWS,
	TAGESPLAN_ROOMS_EG,
	TAGESPLAN_ROOMS_OG,
	DEMO_B_WORKFLOWS,
	RHYTHMUS_ROOMS_EG,
	RHYTHMUS_ROOMS_OG
} from './fixtures/reinigung-data';
import { PB_URL, generateToken, createParticipantClient, submitEntryForm } from './seed-helpers';

export interface ReinigungSeedResult {
	projectId: string;
	roles: Array<{ id: string; name: string }>;
	participants: Array<{ id: string; name: string; token: string }>;
	workflows: Array<{
		id: string;
		name: string;
		stages: Map<string, string>;
		connections: Map<string, string>;
		entryConnectionId: string;
		automations: Array<{ id: string; name: string }>;
		instances: Array<{ id: string; roomName: string }>;
	}>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedBaseProject(pb: PocketBase, projectNameSuffix?: string) {
	await pb.collection('users').authWithPassword(
		ADMIN_CREDENTIALS.email,
		ADMIN_CREDENTIALS.password
	);
	const userId = pb.authStore.record?.id;
	if (!userId) throw new Error('Failed to get authenticated user ID');

	const suffix = projectNameSuffix ? ` - ${projectNameSuffix}` : '';
	const uniqueName = `${REINIGUNG_PROJECT.name}${suffix} ${Date.now().toString().slice(-6)}`;
	const project = await pb.collection('projects').create({
		name: uniqueName,
		description: REINIGUNG_PROJECT.description,
		owner_id: userId,
		is_active: true
	});
	console.log(`Created project: ${project.id} (${uniqueName})`);

	const createdRoles: Array<{ id: string; name: string }> = [];
	for (const role of REINIGUNG_ROLES) {
		const created = await pb.collection('roles').create({
			project_id: project.id,
			name: role.name,
			description: role.description
		});
		createdRoles.push({ id: created.id, name: created.name });
		console.log(`Created role: ${created.name}`);
	}

	const createdParticipants: Array<{ id: string; name: string; token: string }> = [];
	const timestamp = Date.now().toString().slice(-6);
	for (const p of REINIGUNG_PARTICIPANTS) {
		const roleIds = p.roles
			.map((rn) => createdRoles.find((r) => r.name === rn)?.id)
			.filter((id): id is string => !!id);
		const token = generateToken();
		const uniqueEmail = p.email.replace('@', `+${timestamp}@`);
		const created = await pb.collection('participants').create({
			project_id: project.id,
			name: p.name,
			email: uniqueEmail,
			emailVisibility: true,
			password: token,
			passwordConfirm: token,
			token: token,
			is_active: true
		});
		if (roleIds.length > 0) {
			await pb.collection('participants').update(created.id, {
				role_id: roleIds
			});
		}
		createdParticipants.push({ id: created.id, name: created.name, token });
		console.log(`Created participant: ${created.name}`);
	}

	return { projectId: project.id, userId, roles: createdRoles, participants: createdParticipants };
}

async function createWorkflowShell(
	pb: PocketBase,
	projectId: string,
	wfDef: { name: string; description: string }
) {
	const wf = await pb.collection('workflows').create({
		project_id: projectId,
		name: wfDef.name,
		description: wfDef.description,
		workflow_type: 'incident',
		is_active: true,
		entry_allowed_roles: [],
		marker_color: '#ff0000',
		icon_config: {}
	});

	const stages = new Map<string, string>();
	for (let idx = 0; idx < REINIGUNG_STAGES.length; idx++) {
		const stageDef = REINIGUNG_STAGES[idx];
		const stage = await pb.collection('workflow_stages').create({
			workflow_id: wf.id,
			stage_name: stageDef.name,
			stage_type: stageDef.type,
			stage_order: idx,
			position_x: stageDef.x,
			position_y: stageDef.y,
			visible_to_roles: [],
			visual_config: stageDef.visual_config
		});
		stages.set(stageDef.name, stage.id);
	}

	const connections = new Map<string, string>();
	let entryConnectionId = '';
	for (const connDef of REINIGUNG_CONNECTIONS) {
		const fromStageId = connDef.from ? stages.get(connDef.from) : null;
		const toStageId = stages.get(connDef.to)!;
		const isEntry = !connDef.from;
		const conn = await pb.collection('workflow_connections').create({
			workflow_id: wf.id,
			from_stage_id: fromStageId ?? null,
			to_stage_id: toStageId,
			action_name: connDef.action,
			visual_config: {
				button_label: isEntry ? wfDef.name : connDef.action
			}
		});
		const key = connDef.from ? `${connDef.from}->${connDef.to}` : 'entry';
		connections.set(key, conn.id);
		if (isEntry) entryConnectionId = conn.id;
	}

	return { id: wf.id, name: wfDef.name, stages, connections, entryConnectionId };
}

async function createRoomInstances(
	participantPb: PocketBase,
	workflowId: string,
	startStageId: string,
	participantId: string,
	rooms: Array<{
		name: string;
		coordIndex: number;
		fieldValues: Array<{ key: string; value: string }>;
	}>
) {
	const created: Array<{ id: string; roomName: string }> = [];
	for (const room of rooms) {
		const coord = ROOM_COORDINATES[room.coordIndex];
		const { instanceId } = await submitEntryForm(participantPb, {
			workflowId,
			startStageId,
			participantId,
			location: { lat: coord.lat, lon: coord.lon },
			fieldValues: room.fieldValues
		});
		created.push({ id: instanceId, roomName: room.name });
	}
	return created;
}

// ---------------------------------------------------------------------------
// Demo A: Tagesplan
// ---------------------------------------------------------------------------

export async function seedDemoA(): Promise<ReinigungSeedResult> {
	const pb = new PocketBase(PB_URL);
	const base = await seedBaseProject(pb, 'Tagesplan');
	const participantId = base.participants[0].id;
	const participantPb = await createParticipantClient(base.participants[0].token);

	const workflowResults: ReinigungSeedResult['workflows'] = [];

	const roomSets = [TAGESPLAN_ROOMS_EG, TAGESPLAN_ROOMS_OG];

	for (let i = 0; i < DEMO_A_WORKFLOWS.length; i++) {
		const wfDef = DEMO_A_WORKFLOWS[i];
		const roomsDef = roomSets[i];

		const shell = await createWorkflowShell(pb, base.projectId, wfDef);

		// Entry form with Reinigungstag multiple_choice field
		const entryForm = await pb.collection('tools_forms').create({
			workflow_id: shell.id,
			connection_id: shell.entryConnectionId,
			name: 'Raum-Einrichtung',
			description: 'Reinigungstage festlegen'
		});

		const reinigungstagField = await pb.collection('tools_form_fields').create({
			form_id: entryForm.id,
			field_label: 'Reinigungstag',
			field_type: 'multiple_choice',
			is_required: false,
			field_order: 1,
			page: 1,
			row_index: 0,
			column_position: 'full',
			field_options: {
				options: [
					{ label: 'Mo' },
					{ label: 'Di' },
					{ label: 'Mi' },
					{ label: 'Do' },
					{ label: 'Fr' }
				]
			}
		});

		const raumnummerFieldA = await pb.collection('tools_form_fields').create({
			form_id: entryForm.id,
			field_label: 'Raumnummer',
			field_type: 'short_text',
			is_required: false,
			field_order: 2,
			page: 1,
			row_index: 1,
			column_position: 'full'
		});

		// Filterable tag so FilterSheet shows day toggles
		await pb.collection('tools_field_tags').create({
			workflow_id: shell.id,
			tag_mappings: [
				{
					tagType: 'filterable',
					fieldId: reinigungstagField.id,
					config: { filterBy: 'field' }
				}
			]
		});

		const offenStageId = shell.stages.get('Offen')!;
		const erledigtStageId = shell.stages.get('Erledigt')!;

		// Create room instances at "Offen" stage
		const roomsForCreation = roomsDef.map((room) => ({
			name: room.name,
			coordIndex: room.coordIndex,
			fieldValues: [
				{ key: reinigungstagField.id, value: room.reinigungstag },
				{ key: raumnummerFieldA.id, value: room.name }
			]
		}));

		const instances = await createRoomInstances(
			participantPb,
			shell.id,
			offenStageId,
			participantId,
			roomsForCreation
		);

		// Automation: nightly reset -- all Erledigt rooms back to Offen at 2am weekdays
		const resetAutomation = await pb.collection('tools_automation').create({
			workflow_id: shell.id,
			name: 'Naechtlicher Reset',
			trigger_type: 'scheduled',
			trigger_config: {
				cron: '* * * * *',
				target_stage_id: erledigtStageId
			},
			steps: [{
				name: 'Main',
				conditions: null,
				actions: [
					{
						type: 'set_stage',
						params: { stage_id: offenStageId }
					}
				]
			}],
			is_enabled: true
		});

		workflowResults.push({
			id: shell.id,
			name: shell.name,
			stages: shell.stages,
			connections: shell.connections,
			entryConnectionId: shell.entryConnectionId,
			automations: [{ id: resetAutomation.id, name: 'Naechtlicher Reset' }],
			instances
		});

		console.log(
			`[Demo A] Created workflow "${wfDef.name}" with ${instances.length} rooms and 1 automation`
		);
	}

	return {
		projectId: base.projectId,
		roles: base.roles,
		participants: base.participants,
		workflows: workflowResults
	};
}

// ---------------------------------------------------------------------------
// Demo B: Rhythmus
// ---------------------------------------------------------------------------

export async function seedDemoB(): Promise<ReinigungSeedResult> {
	const pb = new PocketBase(PB_URL);
	const base = await seedBaseProject(pb, 'Rhythmus');
	const participantId = base.participants[0].id;
	const participantPb = await createParticipantClient(base.participants[0].token);

	const workflowResults: ReinigungSeedResult['workflows'] = [];
	const roomSets = [RHYTHMUS_ROOMS_EG, RHYTHMUS_ROOMS_OG];

	for (let i = 0; i < DEMO_B_WORKFLOWS.length; i++) {
		const wfDef = DEMO_B_WORKFLOWS[i];
		const roomsDef = roomSets[i];

		const shell = await createWorkflowShell(pb, base.projectId, wfDef);

		// Entry form with interval + counter + room name fields
		const entryForm = await pb.collection('tools_forms').create({
			workflow_id: shell.id,
			connection_id: shell.entryConnectionId,
			name: 'Raum-Parameter',
			description: 'Reinigungsintervall und Zaehler'
		});

		const intervallField = await pb.collection('tools_form_fields').create({
			form_id: entryForm.id,
			field_label: 'Reinigungsintervall',
			field_type: 'dropdown',
			is_required: false,
			field_order: 1,
			page: 1,
			row_index: 0,
			column_position: 'left',
			help_text: 'Intervall in Minuten',
			field_options: {
				options: [
					{ label: '1' },
					{ label: '2' },
					{ label: '3' },
					{ label: '5' }
				]
			}
		});

		const counterField = await pb.collection('tools_form_fields').create({
			form_id: entryForm.id,
			field_label: 'Minuten seit Reinigung',
			field_type: 'number',
			is_required: false,
			field_order: 2,
			page: 1,
			row_index: 0,
			column_position: 'right',
			help_text: 'Automatischer Zaehler'
		});

		const raumnummerFieldB = await pb.collection('tools_form_fields').create({
			form_id: entryForm.id,
			field_label: 'Raumnummer',
			field_type: 'short_text',
			is_required: false,
			field_order: 3,
			page: 1,
			row_index: 1,
			column_position: 'full'
		});

		const offenStageId = shell.stages.get('Offen')!;
		const erledigtStageId = shell.stages.get('Erledigt')!;

		// Create 9 room instances per workflow
		const roomsForCreation = roomsDef.map((room) => ({
			name: room.name,
			coordIndex: room.coordIndex,
			fieldValues: [
				{ key: intervallField.id, value: room.reinigungsintervall },
				{ key: counterField.id, value: String(room.arbeitstage_seit_reinigung) },
				{ key: raumnummerFieldB.id, value: room.name }
			]
		}));

		const instances = await createRoomInstances(
			participantPb,
			shell.id,
			offenStageId,
			participantId,
			roomsForCreation
		);

		// Automation 1: "Minuten zaehlen"
		const countAutomation = await pb.collection('tools_automation').create({
			workflow_id: shell.id,
			name: 'Minuten zaehlen',
			trigger_type: 'scheduled',
			trigger_config: {
				cron: '* * * * *',
				target_stage_id: erledigtStageId
			},
			steps: [{
				name: 'Main',
				conditions: null,
				actions: [
					{
						type: 'set_field_value',
						params: {
							field_key: counterField.id,
							value: `{${counterField.id}} + 1`,
							stage_id: erledigtStageId
						}
					}
				]
			}],
			is_enabled: true
		});

		// Automation 2: "Reset bei Intervall"
		const resetAutomation = await pb.collection('tools_automation').create({
			workflow_id: shell.id,
			name: 'Reset bei Intervall',
			trigger_type: 'scheduled',
			trigger_config: {
				cron: '* * * * *',
				target_stage_id: erledigtStageId
			},
			steps: [{
				name: 'Main',
				conditions: {
					operator: 'AND',
					conditions: [
						{
							type: 'field_value',
							params: {
								field_key: counterField.id,
								operator: 'gte',
								compare_field_key: intervallField.id
							}
						}
					]
				},
				actions: [
					{
						type: 'set_stage',
						params: { stage_id: offenStageId }
					},
					{
						type: 'set_field_value',
						params: {
							field_key: counterField.id,
							value: '0',
							stage_id: offenStageId
						}
					}
				]
			}],
			is_enabled: true
		});

		// Automation 3: "Zaehler-Reset bei Reinigung"
		const transitionResetAutomation = await pb.collection('tools_automation').create({
			workflow_id: shell.id,
			name: 'Zaehler-Reset bei Reinigung',
			trigger_type: 'on_transition',
			trigger_config: {
				from_stage_id: offenStageId,
				to_stage_id: erledigtStageId
			},
			steps: [{
				name: 'Main',
				conditions: null,
				actions: [
					{
						type: 'set_field_value',
						params: {
							field_key: counterField.id,
							value: '0',
							stage_id: erledigtStageId
						}
					}
				]
			}],
			is_enabled: true
		});

		const automations = [
			{ id: countAutomation.id, name: 'Minuten zaehlen' },
			{ id: resetAutomation.id, name: 'Reset bei Intervall' },
			{ id: transitionResetAutomation.id, name: 'Zaehler-Reset bei Reinigung' }
		];

		workflowResults.push({
			id: shell.id,
			name: shell.name,
			stages: shell.stages,
			connections: shell.connections,
			entryConnectionId: shell.entryConnectionId,
			automations,
			instances
		});

		console.log(
			`[Demo B] Created workflow "${wfDef.name}" with ${instances.length} rooms and ${automations.length} automations`
		);
	}

	return {
		projectId: base.projectId,
		roles: base.roles,
		participants: base.participants,
		workflows: workflowResults
	};
}

// ---------------------------------------------------------------------------
// Standalone execution: npx tsx e2e/api-seed-reinigung.ts A|B
// ---------------------------------------------------------------------------

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
	const demo = process.argv[2] || 'A';
	const run = demo.toUpperCase() === 'B' ? seedDemoB : seedDemoA;
	run()
		.then((result) => {
			console.log(`\nSeeding Demo ${demo.toUpperCase()} complete!`);
			console.log(`Project ID: ${result.projectId}`);
			console.log(`Workflows: ${result.workflows.length}`);
			result.workflows.forEach((w) => {
				console.log(
					`  - ${w.name}: ${w.instances.length} rooms, ${w.automations.length} automations`
				);
			});
			console.log('\nParticipant tokens:');
			result.participants.forEach((p) => console.log(`  ${p.name}: ${p.token}`));
			process.exit(0);
		})
		.catch((error) => {
			console.error('Seeding failed:', error);
			process.exit(1);
		});
}
