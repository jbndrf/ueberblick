import PocketBase from 'pocketbase';
import {
	ADMIN_CREDENTIALS,
	BRANDSCHUTZ_PROJECT,
	BRANDSCHUTZ_ROLES,
	BRANDSCHUTZ_PARTICIPANTS,
	FLUCHTWEG_STAGES,
	FLUCHTWEG_CONNECTIONS,
	FLUCHTWEG_TYP_OPTIONS,
	HINDERNIS_OPTIONS,
	AMPEL_OPTIONS,
	EINRICHTUNG_STAGES,
	EINRICHTUNG_CONNECTIONS,
	EINRICHTUNG_TYP_OPTIONS,
	BRANDSCHUTZ_COORDINATES,
	FLUCHTWEG_INSTANCES,
	EINRICHTUNG_INSTANCES
} from './fixtures/brandschutz-data';
import { pinIcon, COLORS } from './fixtures/shared-svg';
import { PB_URL, generateToken, createParticipantClient, submitEntryForm } from './seed-helpers';

export interface BrandschutzSeedResult {
	projectId: string;
	roles: Array<{ id: string; name: string }>;
	participants: Array<{ id: string; name: string; token: string }>;
	workflowFluchtweg: {
		id: string;
		name: string;
		stages: Map<string, string>;
		entryConnectionId: string;
		automations: Array<{ id: string; name: string }>;
		instances: Array<{ id: string }>;
		fields: Map<string, string>;
	};
	workflowEinrichtungen: {
		id: string;
		name: string;
		stages: Map<string, string>;
		entryConnectionId: string;
		instances: Array<{ id: string }>;
	};
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

export async function seedBrandschutz(): Promise<BrandschutzSeedResult> {
	const pb = new PocketBase(PB_URL);

	// Auth
	await pb.collection('users').authWithPassword(
		ADMIN_CREDENTIALS.email,
		ADMIN_CREDENTIALS.password
	);
	const userId = pb.authStore.record?.id;
	if (!userId) throw new Error('Failed to get authenticated user ID');

	// Project
	const uniqueName = `${BRANDSCHUTZ_PROJECT.name} ${Date.now().toString().slice(-6)}`;
	const project = await pb.collection('projects').create({
		name: uniqueName,
		description: BRANDSCHUTZ_PROJECT.description,
		owner_id: userId,
		is_active: true
	});
	console.log(`Created project: ${project.id} (${uniqueName})`);

	// Roles
	const createdRoles: Array<{ id: string; name: string }> = [];
	for (const role of BRANDSCHUTZ_ROLES) {
		const created = await pb.collection('roles').create({
			project_id: project.id,
			name: role.name,
			description: role.description
		});
		createdRoles.push({ id: created.id, name: created.name });
		console.log(`Created role: ${created.name}`);
	}

	const roleId = (name: string) => createdRoles.find((r) => r.name === name)!.id;
	const bsbRoleId = roleId('Brandschutzbeauftragter');
	const sibRoleId = roleId('Sicherheitsbeauftragter');

	// Participants
	const createdParticipants: Array<{ id: string; name: string; token: string }> = [];
	const timestamp = Date.now().toString().slice(-6);
	for (const p of BRANDSCHUTZ_PARTICIPANTS) {
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
			await pb.collection('participants').update(created.id, { role_id: roleIds });
		}
		createdParticipants.push({ id: created.id, name: created.name, token });
		console.log(`Created participant: ${created.name}`);
	}

	const participantId = createdParticipants[0].id;

	// =======================================================================
	// Workflow A: Fluchtweg-Abschnitte
	// =======================================================================

	const wfFlucht = await pb.collection('workflows').create({
		project_id: project.id,
		name: 'Fluchtweg-Kapazitaet',
		description: 'Fluchtweg-Abschnitte mit berechneter Durchlassfaehigkeit (ASR A2.3)',
		workflow_type: 'incident',
		is_active: true,
		entry_allowed_roles: [bsbRoleId, sibRoleId],
		marker_color: '#dc2626',
		icon_config: {}
	});

	// Stages
	const fStages = new Map<string, string>();
	for (let idx = 0; idx < FLUCHTWEG_STAGES.length; idx++) {
		const stageDef = FLUCHTWEG_STAGES[idx];
		const stage = await pb.collection('workflow_stages').create({
			workflow_id: wfFlucht.id,
			stage_name: stageDef.name,
			stage_type: stageDef.type,
			stage_order: idx,
			position_x: stageDef.x,
			position_y: stageDef.y,
			visible_to_roles: [],
			visual_config: {}
		});
		fStages.set(stageDef.name, stage.id);
	}

	// Connections
	let fEntryConnId = '';
	for (const connDef of FLUCHTWEG_CONNECTIONS) {
		const fromStageId = connDef.from ? fStages.get(connDef.from) : null;
		const toStageId = fStages.get(connDef.to)!;
		const isEntry = !connDef.from;

		const visualConfig: Record<string, unknown> = {
			button_label: isEntry ? 'Fluchtweg erfassen' : connDef.action
		};
		if (connDef.to === 'Nicht konform') {
			visualConfig.requires_confirmation = 'ACHTUNG: Fluchtweg wird als NICHT KONFORM dokumentiert. Sofortige Massnahmen erforderlich (ASR A2.3).';
		}

		const conn = await pb.collection('workflow_connections').create({
			workflow_id: wfFlucht.id,
			from_stage_id: fromStageId ?? null,
			to_stage_id: toStageId,
			action_name: connDef.action,
			allowed_roles: [],
			visual_config: visualConfig
		});
		if (isEntry) fEntryConnId = conn.id;
	}

	// Entry form
	const fEntryForm = await pb.collection('tools_forms').create({
		workflow_id: wfFlucht.id,
		connection_id: fEntryConnId,
		name: 'Fluchtweg-Abschnitt erfassen',
		description: 'Bezeichnung, Typ, Personen und Soll-Breite'
	});

	const fields = new Map<string, string>();

	const bezeichnungField = await pb.collection('tools_form_fields').create({
		form_id: fEntryForm.id,
		field_label: 'Abschnitt-Bezeichnung',
		field_type: 'short_text',
		is_required: true,
		field_order: 1,
		page: 1,
		row_index: 0,
		column_position: 'full',
		placeholder: 'z.B. EG Flur Nord Abschnitt 3'
	});
	fields.set('bezeichnung', bezeichnungField.id);

	const typField = await pb.collection('tools_form_fields').create({
		form_id: fEntryForm.id,
		field_label: 'Fluchtweg-Typ',
		field_type: 'dropdown',
		is_required: true,
		field_order: 2,
		page: 1,
		row_index: 1,
		column_position: 'left',
		field_options: { options: FLUCHTWEG_TYP_OPTIONS }
	});
	fields.set('fluchtweg_typ', typField.id);

	const personenField = await pb.collection('tools_form_fields').create({
		form_id: fEntryForm.id,
		field_label: 'Personen im Einzugsgebiet',
		field_type: 'number',
		is_required: true,
		field_order: 3,
		page: 1,
		row_index: 1,
		column_position: 'right',
		help_text: 'ASR A2.3: Anzahl Personen, die diesen Weg nutzen muessen'
	});
	fields.set('personen_einzugsgebiet', personenField.id);

	const sollBreiteField = await pb.collection('tools_form_fields').create({
		form_id: fEntryForm.id,
		field_label: 'Soll-Breite Meter',
		field_type: 'number',
		is_required: true,
		field_order: 4,
		page: 1,
		row_index: 2,
		column_position: 'full',
		help_text: 'Lichte Mindestbreite nach ASR A2.3 Tabelle 1'
	});
	fields.set('soll_breite', sollBreiteField.id);

	// tools_edit fields (editable at Konform + Eingeschraenkt stages)
	const gemesseneBreiteField = await pb.collection('tools_form_fields').create({
		form_id: fEntryForm.id,
		field_label: 'Gemessene Breite',
		field_type: 'number',
		is_required: false,
		field_order: 5,
		page: 1,
		row_index: 3,
		column_position: 'left',
		help_text: 'Aktuelle lichte Breite in Metern'
	});
	fields.set('gemessene_breite', gemesseneBreiteField.id);

	const hindernisField = await pb.collection('tools_form_fields').create({
		form_id: fEntryForm.id,
		field_label: 'Hindernis',
		field_type: 'dropdown',
		is_required: false,
		field_order: 6,
		page: 1,
		row_index: 3,
		column_position: 'right',
		field_options: { options: HINDERNIS_OPTIONS }
	});
	fields.set('hindernis', hindernisField.id);

	const editFotoField = await pb.collection('tools_form_fields').create({
		form_id: fEntryForm.id,
		field_label: 'Foto',
		field_type: 'file',
		is_required: false,
		field_order: 7,
		page: 1,
		row_index: 4,
		column_position: 'full'
	});
	fields.set('foto', editFotoField.id);

	// Calculated fields
	const kapQuoteField = await pb.collection('tools_form_fields').create({
		form_id: fEntryForm.id,
		field_label: 'Kapazitaetsquote',
		field_type: 'number',
		is_required: false,
		field_order: 8,
		page: 1,
		row_index: 5,
		column_position: 'left',
		help_text: 'Automatisch: (Gemessene Breite * 100) / Soll-Breite (%)'
	});
	fields.set('kapazitaetsquote', kapQuoteField.id);

	const evakKapField = await pb.collection('tools_form_fields').create({
		form_id: fEntryForm.id,
		field_label: 'Evakuierungskapazitaet',
		field_type: 'number',
		is_required: false,
		field_order: 9,
		page: 1,
		row_index: 5,
		column_position: 'right',
		help_text: 'Automatisch: Wie viele Personen koennen aktuell diesen Abschnitt nutzen'
	});
	fields.set('evak_kapazitaet', evakKapField.id);

	const ampelField = await pb.collection('tools_form_fields').create({
		form_id: fEntryForm.id,
		field_label: 'Ampel',
		field_type: 'dropdown',
		is_required: false,
		field_order: 10,
		page: 1,
		row_index: 6,
		column_position: 'full',
		help_text: 'Automatisch: Rot/Gelb/Gruen',
		field_options: { options: AMPEL_OPTIONS }
	});
	fields.set('ampel', ampelField.id);

	// tools_edit: BSB + SiB can edit measurement fields at Konform + Eingeschraenkt
	await pb.collection('tools_edit').create({
		name: 'Messung aktualisieren',
		stage_id: [fStages.get('Konform')!, fStages.get('Eingeschraenkt')!],
		editable_fields: [gemesseneBreiteField.id, hindernisField.id, editFotoField.id],
		allowed_roles: [bsbRoleId, sibRoleId],
		edit_mode: 'form_fields',
		visual_config: {}
	});

	// Filterable tag on Ampel
	await pb.collection('tools_field_tags').create({
		workflow_id: wfFlucht.id,
		tag_mappings: [
			{
				tagType: 'filterable',
				fieldId: ampelField.id,
				config: { filterBy: 'field' }
			}
		]
	});

	// filter_value_icons
	await pb.collection('workflows').update(wfFlucht.id, {
		filter_value_icons: {
			'Gruen': pinIcon(COLORS.GREEN),
			'Gelb': pinIcon(COLORS.YELLOW),
			'Rot': pinIcon(COLORS.RED)
		}
	});

	// --- Automations ---
	const automations: Array<{ id: string; name: string }> = [];

	// 1. on_field_change (gemessene_breite) -> kapazitaetsquote = (gemessene_breite * 100) / soll_breite
	const kapQuoteAuto = await pb.collection('tools_automation').create({
		workflow_id: wfFlucht.id,
		name: 'Kapazitaetsquote berechnen',
		trigger_type: 'on_field_change',
		trigger_config: {
			field_key: fields.get('gemessene_breite')!,
			stage_id: null
		},
		steps: [{ name: 'Main', conditions: null, actions: [
			{
				type: 'set_field_value',
				params: {
					field_key: fields.get('kapazitaetsquote')!,
					value: `({${fields.get('gemessene_breite')!}} * 100) / {${fields.get('soll_breite')!}}`,
					stage_id: null
				}
			}
		] }],
		is_enabled: true
	});
	automations.push({ id: kapQuoteAuto.id, name: kapQuoteAuto.name });

	// 2. on_field_change (kapazitaetsquote) -> evak_kapazitaet + ampel classification + stage transitions
	const kapQuoteChainAuto = await pb.collection('tools_automation').create({
		workflow_id: wfFlucht.id,
		name: 'Kapazitaetsquote Auswertung',
		trigger_type: 'on_field_change',
		trigger_config: {
			field_key: fields.get('kapazitaetsquote')!,
			stage_id: null
		},
		steps: [
			{
				name: 'Evakuierungskapazitaet',
				conditions: null,
				actions: [
					{
						type: 'set_field_value',
						params: {
							field_key: fields.get('evak_kapazitaet')!,
							value: `({${fields.get('kapazitaetsquote')!}} * {${fields.get('personen_einzugsgebiet')!}}) / 100`,
							stage_id: null
						}
					}
				]
			},
			{
				name: 'Rot',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('kapazitaetsquote')!, operator: 'lte', value: '50' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('ampel')!, value: 'Rot' } },
					{ type: 'set_stage', params: { stage_id: fStages.get('Nicht konform')! } }
				]
			},
			{
				name: 'Gelb',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('kapazitaetsquote')!, operator: 'gt', value: '50' } },
						{ type: 'field_value', params: { field_key: fields.get('kapazitaetsquote')!, operator: 'lte', value: '80' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('ampel')!, value: 'Gelb' } },
					{ type: 'set_stage', params: { stage_id: fStages.get('Eingeschraenkt')! } }
				]
			},
			{
				name: 'Gruen',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('kapazitaetsquote')!, operator: 'gt', value: '80' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('ampel')!, value: 'Gruen' } }
				]
			}
		],
		is_enabled: true
	});
	automations.push({ id: kapQuoteChainAuto.id, name: kapQuoteChainAuto.name });

	// --- Create Fluchtweg instances ---
	const participantPb = await createParticipantClient(createdParticipants[0].token);
	const fInstances: Array<{ id: string }> = [];
	const konformStageId = fStages.get('Konform')!;

	for (const inst of FLUCHTWEG_INSTANCES) {
		const coord = BRANDSCHUTZ_COORDINATES[inst.coordIndex];

		// Only submit user-input fields; automations will calculate:
		// gemessene_breite -> kapazitaetsquote -> evak_kapazitaet + ampel -> maybe auto-transition
		// Order: soll_breite before gemessene_breite (kapazitaetsquote needs both)
		const { instanceId } = await submitEntryForm(participantPb, {
			workflowId: wfFlucht.id,
			startStageId: konformStageId,
			participantId,
			location: { lat: coord.lat, lon: coord.lon },
			fieldValues: [
				{ key: fields.get('bezeichnung')!, value: inst.bezeichnung },
				{ key: fields.get('fluchtweg_typ')!, value: inst.fluchtweg_typ },
				{ key: fields.get('personen_einzugsgebiet')!, value: String(inst.personen_einzugsgebiet) },
				{ key: fields.get('soll_breite')!, value: String(inst.soll_breite) },
				{ key: fields.get('gemessene_breite')!, value: String(inst.gemessene_breite) },
				{ key: fields.get('hindernis')!, value: inst.hindernis }
			]
		});

		fInstances.push({ id: instanceId });
	}

	console.log(`[Fluchtweg] Created ${fInstances.length} instances, ${automations.length} automations`);

	// =======================================================================
	// Workflow B: Brandschutzeinrichtungen
	// =======================================================================

	const wfEinr = await pb.collection('workflows').create({
		project_id: project.id,
		name: 'Brandschutzeinrichtungen',
		description: 'Feuerloescher, Brandschutztueren, Rauchmelder',
		workflow_type: 'incident',
		is_active: true,
		entry_allowed_roles: [bsbRoleId, sibRoleId],
		marker_color: '#2563eb',
		icon_config: {}
	});

	// Stages
	const eStages = new Map<string, string>();
	for (let idx = 0; idx < EINRICHTUNG_STAGES.length; idx++) {
		const stageDef = EINRICHTUNG_STAGES[idx];
		const stage = await pb.collection('workflow_stages').create({
			workflow_id: wfEinr.id,
			stage_name: stageDef.name,
			stage_type: stageDef.type,
			stage_order: idx,
			position_x: stageDef.x,
			position_y: stageDef.y,
			visible_to_roles: [],
			visual_config: {}
		});
		eStages.set(stageDef.name, stage.id);
	}

	// Connections
	let eEntryConnId = '';
	for (const connDef of EINRICHTUNG_CONNECTIONS) {
		const fromStageId = connDef.from ? eStages.get(connDef.from) : null;
		const toStageId = eStages.get(connDef.to)!;
		const isEntry = !connDef.from;
		const conn = await pb.collection('workflow_connections').create({
			workflow_id: wfEinr.id,
			from_stage_id: fromStageId ?? null,
			to_stage_id: toStageId,
			action_name: connDef.action,
			allowed_roles: [],
			visual_config: { button_label: isEntry ? 'Einrichtung erfassen' : connDef.action }
		});
		if (isEntry) eEntryConnId = conn.id;
	}

	// Entry form
	const eEntryForm = await pb.collection('tools_forms').create({
		workflow_id: wfEinr.id,
		connection_id: eEntryConnId,
		name: 'Brandschutzeinrichtung erfassen',
		description: 'Typ und Standort der Einrichtung'
	});

	const typEinrField = await pb.collection('tools_form_fields').create({
		form_id: eEntryForm.id,
		field_label: 'Typ',
		field_type: 'dropdown',
		is_required: true,
		field_order: 1,
		page: 1,
		row_index: 0,
		column_position: 'full',
		field_options: { options: EINRICHTUNG_TYP_OPTIONS }
	});

	const standortField = await pb.collection('tools_form_fields').create({
		form_id: eEntryForm.id,
		field_label: 'Standort',
		field_type: 'short_text',
		is_required: true,
		field_order: 2,
		page: 1,
		row_index: 1,
		column_position: 'full'
	});

	// Create Einrichtung instances
	const eInstances: Array<{ id: string }> = [];
	const geprueftStageId = eStages.get('Geprueft')!;

	for (const inst of EINRICHTUNG_INSTANCES) {
		const coord = BRANDSCHUTZ_COORDINATES[inst.coordIndex];

		const { instanceId } = await submitEntryForm(participantPb, {
			workflowId: wfEinr.id,
			startStageId: geprueftStageId,
			participantId,
			location: { lat: coord.lat, lon: coord.lon },
			fieldValues: [
				{ key: typEinrField.id, value: inst.typ },
				{ key: standortField.id, value: inst.standort }
			]
		});

		eInstances.push({ id: instanceId });
	}

	console.log(`[Einrichtungen] Created ${eInstances.length} instances`);

	return {
		projectId: project.id,
		roles: createdRoles,
		participants: createdParticipants,
		workflowFluchtweg: {
			id: wfFlucht.id,
			name: wfFlucht.name,
			stages: fStages,
			entryConnectionId: fEntryConnId,
			automations,
			instances: fInstances,
			fields
		},
		workflowEinrichtungen: {
			id: wfEinr.id,
			name: wfEinr.name,
			stages: eStages,
			entryConnectionId: eEntryConnId,
			instances: eInstances
		}
	};
}

// ---------------------------------------------------------------------------
// Standalone execution: npx tsx e2e/api-seed-brandschutz.ts
// ---------------------------------------------------------------------------

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
	seedBrandschutz()
		.then((result) => {
			console.log('\nSeeding Brandschutz complete!');
			console.log(`Project ID: ${result.projectId}`);
			console.log(`Fluchtweg: ${result.workflowFluchtweg.name} (${result.workflowFluchtweg.id})`);
			console.log(`  Instances: ${result.workflowFluchtweg.instances.length}`);
			console.log(`  Automations: ${result.workflowFluchtweg.automations.length}`);
			console.log(`Einrichtungen: ${result.workflowEinrichtungen.name} (${result.workflowEinrichtungen.id})`);
			console.log(`  Instances: ${result.workflowEinrichtungen.instances.length}`);
			console.log('\nParticipant tokens:');
			result.participants.forEach((p) => console.log(`  ${p.name}: ${p.token}`));
			process.exit(0);
		})
		.catch((error) => {
			console.error('Seeding failed:', error);
			process.exit(1);
		});
}
