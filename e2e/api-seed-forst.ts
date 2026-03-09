import PocketBase from 'pocketbase';
import {
	ADMIN_CREDENTIALS,
	FORST_PROJECT,
	FORST_ROLES,
	FORST_PARTICIPANTS,
	WORKFLOW_A,
	BEFALLS_STAGES,
	BEFALLS_CONNECTIONS,
	BAUMART_OPTIONS,
	SCHADSTUFE_OPTIONS,
	BEFALLSMERKMALE_OPTIONS,
	DRINGLICHKEIT_OPTIONS,
	WORKFLOW_B,
	SICHTUNGEN_STAGES,
	SICHTUNGEN_CONNECTIONS,
	KAEFERART_OPTIONS,
	BEFALLSSTADIUM_OPTIONS,
	FORST_COORDINATES,
	BEFALLS_INSTANCES,
	SICHTUNGEN_INSTANCES
} from './fixtures/forst-data';
import { pinIcon, stageIconConfig, COLORS } from './fixtures/shared-svg';
import { PB_URL, generateToken, createParticipantClient, submitEntryForm } from './seed-helpers';

export interface ForstSeedResult {
	projectId: string;
	roles: Array<{ id: string; name: string }>;
	participants: Array<{ id: string; name: string; token: string }>;
	workflowA: {
		id: string;
		name: string;
		stages: Map<string, string>;
		entryConnectionId: string;
		automations: Array<{ id: string; name: string }>;
		instances: Array<{ id: string }>;
		fields: Map<string, string>;
	};
	workflowB: {
		id: string;
		name: string;
		stages: Map<string, string>;
		entryConnectionId: string;
		automations: Array<{ id: string; name: string }>;
		instances: Array<{ id: string }>;
	};
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedBaseProject(pb: PocketBase) {
	await pb.collection('users').authWithPassword(
		ADMIN_CREDENTIALS.email,
		ADMIN_CREDENTIALS.password
	);
	const userId = pb.authStore.record?.id;
	if (!userId) throw new Error('Failed to get authenticated user ID');

	const uniqueName = `${FORST_PROJECT.name} ${Date.now().toString().slice(-6)}`;
	const project = await pb.collection('projects').create({
		name: uniqueName,
		description: FORST_PROJECT.description,
		owner_id: userId,
		is_active: true
	});
	console.log(`Created project: ${project.id} (${uniqueName})`);

	const createdRoles: Array<{ id: string; name: string }> = [];
	for (const role of FORST_ROLES) {
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
	for (const p of FORST_PARTICIPANTS) {
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

// ---------------------------------------------------------------------------
// Workflow A: Befallsueberwachung
// ---------------------------------------------------------------------------

async function seedWorkflowA(
	pb: PocketBase,
	projectId: string,
	roles: Array<{ id: string; name: string }>,
	participantId: string,
	participantToken: string
) {
	const foersterRoleId = roles.find((r) => r.name === 'Foerster')!.id;
	const waldarbeiterRoleId = roles.find((r) => r.name === 'Waldarbeiter')!.id;

	// Create workflow
	const wf = await pb.collection('workflows').create({
		project_id: projectId,
		name: WORKFLOW_A.name,
		description: WORKFLOW_A.description,
		workflow_type: 'incident',
		is_active: true,
		entry_allowed_roles: [foersterRoleId, waldarbeiterRoleId],
		marker_color: '#16a34a',
		icon_config: {}
	});

	// Create stages
	const stages = new Map<string, string>();
	for (let idx = 0; idx < BEFALLS_STAGES.length; idx++) {
		const stageDef = BEFALLS_STAGES[idx];
		const stage = await pb.collection('workflow_stages').create({
			workflow_id: wf.id,
			stage_name: stageDef.name,
			stage_type: stageDef.type,
			stage_order: idx,
			position_x: stageDef.x,
			position_y: stageDef.y,
			visible_to_roles: [],
			visual_config: {}
		});
		stages.set(stageDef.name, stage.id);
	}

	// Create connections
	let entryConnectionId = '';
	for (const connDef of BEFALLS_CONNECTIONS) {
		const fromStageId = connDef.from ? stages.get(connDef.from) : null;
		const toStageId = stages.get(connDef.to)!;
		const isEntry = !connDef.from;
		const conn = await pb.collection('workflow_connections').create({
			workflow_id: wf.id,
			from_stage_id: fromStageId ?? null,
			to_stage_id: toStageId,
			action_name: connDef.action,
			allowed_roles: isEntry ? [foersterRoleId, waldarbeiterRoleId] : [],
			visual_config: {
				button_label: isEntry ? WORKFLOW_A.name : connDef.action
			}
		});
		if (isEntry) entryConnectionId = conn.id;
	}

	// Entry form -- Page 1: Standort
	const entryForm = await pb.collection('tools_forms').create({
		workflow_id: wf.id,
		connection_id: entryConnectionId,
		name: 'Standort-Erfassung',
		description: 'Baumart, Schadstufe und Befallsmerkmale erfassen'
	});

	const fields = new Map<string, string>();

	const baumartField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Baumart',
		field_type: 'dropdown',
		is_required: true,
		field_order: 1,
		page: 1,
		page_title: 'Standort',
		row_index: 0,
		column_position: 'full',
		field_options: { options: BAUMART_OPTIONS }
	});
	fields.set('baumart', baumartField.id);

	const schadstufeField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Schadstufe',
		field_type: 'dropdown',
		is_required: true,
		field_order: 2,
		page: 1,
		row_index: 1,
		column_position: 'full',
		help_text: 'Waldzustandserhebung (WZE) -- Kronenverlichtung',
		field_options: { options: SCHADSTUFE_OPTIONS }
	});
	fields.set('schadstufe', schadstufeField.id);

	// Page 2: Befallsmerkmale (single multiple_choice field)
	const befallsmerkmaleField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Befallsmerkmale',
		field_type: 'multiple_choice',
		is_required: false,
		field_order: 3,
		page: 2,
		page_title: 'Befallsmerkmale',
		row_index: 0,
		column_position: 'full',
		help_text: 'Alle zutreffenden Merkmale auswaehlen',
		field_options: { options: BEFALLSMERKMALE_OPTIONS }
	});
	fields.set('befallsmerkmale', befallsmerkmaleField.id);

	// Calculated fields (set by automations)
	const befallsindexField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Befallsindex',
		field_type: 'number',
		is_required: false,
		field_order: 8,
		page: 2,
		row_index: 5,
		column_position: 'left',
		help_text: 'Automatisch berechnet (Summe Befallsmerkmale, 0-5)'
	});
	fields.set('befallsindex', befallsindexField.id);

	const gesamtrisikoField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Gesamtrisiko',
		field_type: 'number',
		is_required: false,
		field_order: 9,
		page: 2,
		row_index: 5,
		column_position: 'right',
		help_text: 'Automatisch berechnet (Befallsindex * (Schadstufe+1), 0-25)'
	});
	fields.set('gesamtrisiko', gesamtrisikoField.id);

	const dringlichkeitField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Dringlichkeit',
		field_type: 'dropdown',
		is_required: false,
		field_order: 10,
		page: 2,
		row_index: 6,
		column_position: 'full',
		help_text: 'Automatisch: A=sofort, B=zeitnah, C=beobachten, D=kein Handlungsbedarf',
		field_options: { options: DRINGLICHKEIT_OPTIONS }
	});
	fields.set('dringlichkeit', dringlichkeitField.id);

	// tools_edit: Foerster + Waldarbeiter can edit Befallsmerkmale at Monitoring + Verdacht
	const monitoringStageId = stages.get('Monitoring')!;
	const verdachtStageId = stages.get('Verdacht')!;

	await pb.collection('tools_edit').create({
		name: 'Befallsmerkmale aktualisieren',
		stage_id: [monitoringStageId, verdachtStageId],
		editable_fields: [befallsmerkmaleField.id],
		allowed_roles: [foersterRoleId, waldarbeiterRoleId],
		edit_mode: 'form_fields',
		visual_config: {}
	});

	// Filterable tag on Dringlichkeit
	await pb.collection('tools_field_tags').create({
		workflow_id: wf.id,
		tag_mappings: [
			{
				tagType: 'filterable',
				fieldId: dringlichkeitField.id,
				config: { filterBy: 'field' }
			}
		]
	});

	// filter_value_icons
	await pb.collection('workflows').update(wf.id, {
		filter_value_icons: {
			'A': pinIcon(COLORS.RED),
			'B': pinIcon(COLORS.ORANGE),
			'C': pinIcon(COLORS.YELLOW),
			'D': pinIcon(COLORS.GREEN)
		}
	});

	// --- Automations ---
	const automations: Array<{ id: string; name: string }> = [];

	// 1. on_field_change (befallsmerkmale) -> befallsindex = count({befallsmerkmale})
	const befallsindexAuto = await pb.collection('tools_automation').create({
		workflow_id: wf.id,
		name: 'Befallsindex berechnen',
		trigger_type: 'on_field_change',
		trigger_config: {
			field_key: fields.get('befallsmerkmale')!,
			stage_id: null
		},
		steps: [{ name: 'Main', conditions: null, actions: [
			{
				type: 'set_field_value',
				params: {
					field_key: fields.get('befallsindex')!,
					value: `count({${fields.get('befallsmerkmale')!}})`,
					stage_id: null
				}
			}
		] }],
		is_enabled: true
	});
	automations.push({ id: befallsindexAuto.id, name: befallsindexAuto.name });

	// 2. on_field_change (befallsindex OR schadstufe) -> calculate gesamtrisiko
	for (const triggerKey of ['befallsindex', 'schadstufe']) {
		const auto = await pb.collection('tools_automation').create({
			workflow_id: wf.id,
			name: `Gesamtrisiko berechnen (${triggerKey})`,
			trigger_type: 'on_field_change',
			trigger_config: {
				field_key: fields.get(triggerKey)!,
				stage_id: null
			},
			steps: [{ name: 'Main', conditions: null, actions: [
				{
					type: 'set_field_value',
					params: {
						field_key: fields.get('gesamtrisiko')!,
						value: `{${fields.get('befallsindex')!}} * ({${fields.get('schadstufe')!}} + 1)`,
						stage_id: null
					}
				}
			] }],
			is_enabled: true
		});
		automations.push({ id: auto.id, name: auto.name });
	}

	// 3. on_field_change (gesamtrisiko) -> categorize dringlichkeit + auto-transition
	const dringlichkeitAuto = await pb.collection('tools_automation').create({
		workflow_id: wf.id,
		name: 'Dringlichkeit kategorisieren',
		trigger_type: 'on_field_change',
		trigger_config: {
			field_key: fields.get('gesamtrisiko')!,
			stage_id: null
		},
		steps: [
			{
				name: 'A - Sofort + Befall bestaetigt',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('gesamtrisiko')!, operator: 'gte', value: '15' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('dringlichkeit')!, value: 'A' } },
					{ type: 'set_stage', params: { stage_id: stages.get('Befall bestaetigt')! } }
				]
			},
			{
				name: 'B - Zeitnah',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('gesamtrisiko')!, operator: 'gte', value: '8' } },
						{ type: 'field_value', params: { field_key: fields.get('gesamtrisiko')!, operator: 'lt', value: '15' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('dringlichkeit')!, value: 'B' } }
				]
			},
			{
				name: 'C - Beobachten',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('gesamtrisiko')!, operator: 'gte', value: '3' } },
						{ type: 'field_value', params: { field_key: fields.get('gesamtrisiko')!, operator: 'lt', value: '8' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('dringlichkeit')!, value: 'C' } }
				]
			},
			{
				name: 'D - Kein Handlungsbedarf',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('gesamtrisiko')!, operator: 'lt', value: '3' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('dringlichkeit')!, value: 'D' } }
				]
			}
		],
		is_enabled: true
	});
	automations.push({ id: dringlichkeitAuto.id, name: dringlichkeitAuto.name });

	// --- Create instances as participant (automations calculate derived fields) ---
	const instances: Array<{ id: string }> = [];
	const monitoringStageId2 = stages.get('Monitoring')!;

	const participantPb = await createParticipantClient(participantToken);

	for (const inst of BEFALLS_INSTANCES) {
		const coord = FORST_COORDINATES[inst.coordIndex];

		// Only submit user-input fields; automations will calculate:
		// befallsmerkmale -> befallsindex -> gesamtrisiko -> dringlichkeit -> maybe auto-transition
		// Order matters: schadstufe before befallsmerkmale so gesamtrisiko calc has both inputs
		const { instanceId } = await submitEntryForm(participantPb, {
			workflowId: wf.id,
			startStageId: monitoringStageId2,
			participantId,
			location: { lat: coord.lat, lon: coord.lon },
			fieldValues: [
				{ key: fields.get('baumart')!, value: inst.baumart },
				{ key: fields.get('schadstufe')!, value: inst.schadstufe },
				{ key: fields.get('befallsmerkmale')!, value: JSON.stringify(inst.befallsmerkmale) }
			]
		});

		instances.push({ id: instanceId });
	}

	console.log(`[Workflow A] Created "${WORKFLOW_A.name}" with ${instances.length} instances, ${automations.length} automations`);

	return {
		id: wf.id,
		name: wf.name,
		stages,
		entryConnectionId,
		automations,
		instances,
		fields
	};
}

// ---------------------------------------------------------------------------
// Workflow B: Kaefersichtungen
// ---------------------------------------------------------------------------

async function seedWorkflowB(
	pb: PocketBase,
	projectId: string,
	roles: Array<{ id: string; name: string }>,
	participantId: string,
	participantToken: string
) {
	const foersterRoleId = roles.find((r) => r.name === 'Foerster')!.id;
	const waldarbeiterRoleId = roles.find((r) => r.name === 'Waldarbeiter')!.id;

	// Create workflow
	const wf = await pb.collection('workflows').create({
		project_id: projectId,
		name: WORKFLOW_B.name,
		description: WORKFLOW_B.description,
		workflow_type: 'incident',
		is_active: true,
		entry_allowed_roles: [foersterRoleId, waldarbeiterRoleId],
		marker_color: '#dc2626',
		icon_config: {}
	});

	// Create stages with stage-specific icons
	const stageColors: Record<string, string> = {
		'Aktuell': COLORS.RED,
		'Letzte Woche': COLORS.ORANGE,
		'Vor 2 Wochen': COLORS.PALE_YELLOW,
		'Historisch': COLORS.GRAY
	};

	const stages = new Map<string, string>();
	for (let idx = 0; idx < SICHTUNGEN_STAGES.length; idx++) {
		const stageDef = SICHTUNGEN_STAGES[idx];
		const stage = await pb.collection('workflow_stages').create({
			workflow_id: wf.id,
			stage_name: stageDef.name,
			stage_type: stageDef.type,
			stage_order: idx,
			position_x: stageDef.x,
			position_y: stageDef.y,
			visible_to_roles: [],
			visual_config: stageIconConfig(stageColors[stageDef.name] || COLORS.GRAY)
		});
		stages.set(stageDef.name, stage.id);
	}

	// Connections (only entry -- no manual transitions)
	let entryConnectionId = '';
	for (const connDef of SICHTUNGEN_CONNECTIONS) {
		const toStageId = stages.get(connDef.to)!;
		const conn = await pb.collection('workflow_connections').create({
			workflow_id: wf.id,
			from_stage_id: null,
			to_stage_id: toStageId,
			action_name: connDef.action,
			allowed_roles: [foersterRoleId, waldarbeiterRoleId],
			visual_config: { button_label: WORKFLOW_B.name }
		});
		entryConnectionId = conn.id;
	}

	// Entry form
	const entryForm = await pb.collection('tools_forms').create({
		workflow_id: wf.id,
		connection_id: entryConnectionId,
		name: 'Kaefersichtung melden',
		description: 'Art, Stadium und Foto erfassen'
	});

	const kaeferartField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Kaeferart',
		field_type: 'dropdown',
		is_required: true,
		field_order: 1,
		page: 1,
		row_index: 0,
		column_position: 'full',
		field_options: { options: KAEFERART_OPTIONS }
	});

	const stadiumField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Befallsstadium',
		field_type: 'dropdown',
		is_required: true,
		field_order: 2,
		page: 1,
		row_index: 1,
		column_position: 'full',
		field_options: { options: BEFALLSSTADIUM_OPTIONS }
	});

	const fotoField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Foto',
		field_type: 'file',
		is_required: false,
		field_order: 3,
		page: 1,
		row_index: 2,
		column_position: 'full'
	});

	// Filterable tag by STAGE (not field!) -- this is the time-wave visualization
	await pb.collection('tools_field_tags').create({
		workflow_id: wf.id,
		tag_mappings: [
			{
				tagType: 'filterable',
				fieldId: kaeferartField.id,
				config: { filterBy: 'stage' }
			}
		]
	});

	// filter_value_icons keyed by stage ID
	await pb.collection('workflows').update(wf.id, {
		filter_value_icons: {
			[stages.get('Aktuell')!]: pinIcon(COLORS.RED),
			[stages.get('Letzte Woche')!]: pinIcon(COLORS.ORANGE),
			[stages.get('Vor 2 Wochen')!]: pinIcon(COLORS.PALE_YELLOW),
			[stages.get('Historisch')!]: pinIcon(COLORS.GRAY)
		}
	});

	// --- Scheduled automations: weekly stage progression ---
	const automations: Array<{ id: string; name: string }> = [];

	const progressions = [
		{ from: 'Aktuell', to: 'Letzte Woche' },
		{ from: 'Letzte Woche', to: 'Vor 2 Wochen' },
		{ from: 'Vor 2 Wochen', to: 'Historisch' }
	];

	for (const prog of progressions) {
		const auto = await pb.collection('tools_automation').create({
			workflow_id: wf.id,
			name: `Verblassen: ${prog.from} -> ${prog.to}`,
			trigger_type: 'scheduled',
			trigger_config: {
				cron: '* * * * *',
				target_stage_id: stages.get(prog.from)!
			},
			steps: [{ name: 'Main', conditions: null, actions: [
				{
					type: 'set_stage',
					params: { stage_id: stages.get(prog.to)! }
				}
			] }],
			is_enabled: true
		});
		automations.push({ id: auto.id, name: auto.name });
	}

	// Archive Historisch instances
	const archiveAuto = await pb.collection('tools_automation').create({
		workflow_id: wf.id,
		name: 'Archivieren: Historisch -> archived',
		trigger_type: 'scheduled',
		trigger_config: {
			cron: '* * * * *',
			target_stage_id: stages.get('Historisch')!
		},
		steps: [{ name: 'Main', conditions: null, actions: [
			{
				type: 'set_instance_status',
				params: { status: 'archived' }
			}
		] }],
		is_enabled: true
	});
	automations.push({ id: archiveAuto.id, name: archiveAuto.name });

	// --- Create instances as participant (no on_field_change automations here) ---
	const instances: Array<{ id: string }> = [];
	const aktuellStageId = stages.get('Aktuell')!;

	const participantPb = await createParticipantClient(participantToken);

	for (const inst of SICHTUNGEN_INSTANCES) {
		const coord = FORST_COORDINATES[inst.coordIndex];

		const { instanceId } = await submitEntryForm(participantPb, {
			workflowId: wf.id,
			startStageId: aktuellStageId,
			participantId,
			location: { lat: coord.lat, lon: coord.lon },
			fieldValues: [
				{ key: kaeferartField.id, value: inst.kaeferart },
				{ key: stadiumField.id, value: inst.befallsstadium }
			]
		});

		instances.push({ id: instanceId });
	}

	console.log(`[Workflow B] Created "${WORKFLOW_B.name}" with ${instances.length} instances, ${automations.length} automations`);

	return {
		id: wf.id,
		name: wf.name,
		stages,
		entryConnectionId,
		automations,
		instances
	};
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

export async function seedForst(): Promise<ForstSeedResult> {
	const pb = new PocketBase(PB_URL);
	const base = await seedBaseProject(pb);
	const participantId = base.participants[0].id;
	const participantToken = base.participants[0].token;

	const workflowA = await seedWorkflowA(pb, base.projectId, base.roles, participantId, participantToken);
	const workflowB = await seedWorkflowB(pb, base.projectId, base.roles, participantId, participantToken);

	return {
		projectId: base.projectId,
		roles: base.roles,
		participants: base.participants,
		workflowA,
		workflowB
	};
}

// ---------------------------------------------------------------------------
// Standalone execution: npx tsx e2e/api-seed-forst.ts
// ---------------------------------------------------------------------------

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
	seedForst()
		.then((result) => {
			console.log('\nSeeding Forstbetrieb complete!');
			console.log(`Project ID: ${result.projectId}`);
			console.log(`Workflow A: ${result.workflowA.name} (${result.workflowA.id})`);
			console.log(`  Instances: ${result.workflowA.instances.length}`);
			console.log(`  Automations: ${result.workflowA.automations.length}`);
			console.log(`Workflow B: ${result.workflowB.name} (${result.workflowB.id})`);
			console.log(`  Instances: ${result.workflowB.instances.length}`);
			console.log(`  Automations: ${result.workflowB.automations.length}`);
			console.log('\nParticipant tokens:');
			result.participants.forEach((p) => console.log(`  ${p.name}: ${p.token}`));
			process.exit(0);
		})
		.catch((error) => {
			console.error('Seeding failed:', error);
			process.exit(1);
		});
}
