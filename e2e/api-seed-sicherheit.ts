import PocketBase from 'pocketbase';
import {
	ADMIN_CREDENTIALS,
	SICHERHEIT_PROJECT,
	SICHERHEIT_ROLES,
	SICHERHEIT_PARTICIPANTS,
	SICHERHEIT_STAGES,
	SICHERHEIT_CONNECTIONS,
	GEFAEHRDUNGSFAKTOR_OPTIONS,
	DETAILTYP_MAPPINGS,
	EINTRITTSWAHRSCHEINLICHKEIT_OPTIONS,
	SCHADENSSCHWERE_OPTIONS,
	RISIKOKLASSE_OPTIONS,
	MASSNAHMENART_OPTIONS,
	MASSNAHMENKATALOG_COLUMNS,
	MASSNAHMENKATALOG_DATA,
	SICHERHEIT_COORDINATES,
	SICHERHEIT_INSTANCES
} from './fixtures/sicherheit-data';
import { pinIcon, COLORS } from './fixtures/shared-svg';
import { PB_URL, generateToken, createParticipantClient, submitEntryForm } from './seed-helpers';

export interface SicherheitSeedResult {
	projectId: string;
	roles: Array<{ id: string; name: string }>;
	participants: Array<{ id: string; name: string; token: string }>;
	workflow: {
		id: string;
		name: string;
		stages: Map<string, string>;
		entryConnectionId: string;
		automations: Array<{ id: string; name: string }>;
		instances: Array<{ id: string }>;
		fields: Map<string, string>;
	};
	customTable: { id: string; name: string };
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

export async function seedSicherheit(): Promise<SicherheitSeedResult> {
	const pb = new PocketBase(PB_URL);

	// Auth
	await pb.collection('users').authWithPassword(
		ADMIN_CREDENTIALS.email,
		ADMIN_CREDENTIALS.password
	);
	const userId = pb.authStore.record?.id;
	if (!userId) throw new Error('Failed to get authenticated user ID');

	// Project
	const uniqueName = `${SICHERHEIT_PROJECT.name} ${Date.now().toString().slice(-6)}`;
	const project = await pb.collection('projects').create({
		name: uniqueName,
		description: SICHERHEIT_PROJECT.description,
		owner_id: userId,
		is_active: true
	});
	console.log(`Created project: ${project.id} (${uniqueName})`);

	// Roles
	const createdRoles: Array<{ id: string; name: string }> = [];
	for (const role of SICHERHEIT_ROLES) {
		const created = await pb.collection('roles').create({
			project_id: project.id,
			name: role.name,
			description: role.description
		});
		createdRoles.push({ id: created.id, name: created.name });
		console.log(`Created role: ${created.name}`);
	}

	// Participants
	const createdParticipants: Array<{ id: string; name: string; token: string }> = [];
	const timestamp = Date.now().toString().slice(-6);
	for (const p of SICHERHEIT_PARTICIPANTS) {
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

	// --- Custom Table: Massnahmenkatalog ---
	const customTable = await pb.collection('custom_tables').create({
		project_id: project.id,
		table_name: 'massnahmenkatalog',
		display_name: 'Massnahmenkatalog',
		description: 'Vordefinierte Massnahmen nach T-O-P Prinzip (BetrSichV)',
		main_column: 'massnahme',
		visible_to_roles: []
	});

	for (const col of MASSNAHMENKATALOG_COLUMNS) {
		await pb.collection('custom_table_columns').create({
			table_id: customTable.id,
			column_name: col.column_name,
			column_type: col.column_type,
			is_required: col.is_required,
			sort_order: MASSNAHMENKATALOG_COLUMNS.indexOf(col)
		});
	}

	for (const row of MASSNAHMENKATALOG_DATA) {
		await pb.collection('custom_table_data').create({
			table_id: customTable.id,
			row_data: row
		});
	}
	console.log(`Created custom table: ${customTable.id} (Massnahmenkatalog) with ${MASSNAHMENKATALOG_DATA.length} rows`);

	// --- Workflow ---
	const wf = await pb.collection('workflows').create({
		project_id: project.id,
		name: 'Gefaehrdungsbeurteilung',
		description: 'Nohl-Risikomatrix: E + S - 1 = Risikomasszahl',
		workflow_type: 'incident',
		is_active: true,
		entry_allowed_roles: createdRoles.map((r) => r.id),
		marker_color: '#ef4444',
		icon_config: {}
	});

	// Stages
	const stages = new Map<string, string>();
	for (let idx = 0; idx < SICHERHEIT_STAGES.length; idx++) {
		const stageDef = SICHERHEIT_STAGES[idx];
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

	// Connections
	let entryConnectionId = '';
	const connectionIds = new Map<string, string>();
	for (const connDef of SICHERHEIT_CONNECTIONS) {
		const fromStageId = connDef.from ? stages.get(connDef.from) : null;
		const toStageId = stages.get(connDef.to)!;
		const isEntry = !connDef.from;
		const conn = await pb.collection('workflow_connections').create({
			workflow_id: wf.id,
			from_stage_id: fromStageId ?? null,
			to_stage_id: toStageId,
			action_name: connDef.action,
			allowed_roles: [],
			visual_config: {
				button_label: isEntry ? 'Gefaehrdung erfassen' : connDef.action,
				...(connDef.to === 'Behoben' ? {
					requires_confirmation: 'Gefaehrdung wird als BEHOBEN dokumentiert.'
				} : {})
			}
		});
		if (isEntry) entryConnectionId = conn.id;
		const key = connDef.from ? `${connDef.from}->${connDef.to}` : 'entry';
		connectionIds.set(key, conn.id);
	}

	// --- Entry Form ---
	const entryForm = await pb.collection('tools_forms').create({
		workflow_id: wf.id,
		connection_id: entryConnectionId,
		name: 'Gefaehrdungserfassung',
		description: 'Gefaehrdungsfaktor, Risikobewertung und Dokumentation'
	});

	const fields = new Map<string, string>();

	// Page 1: Gefaehrdungsermittlung
	const gefFaktorField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Gefaehrdungsfaktor',
		field_type: 'dropdown',
		is_required: true,
		field_order: 1,
		page: 1,
		page_title: 'Gefaehrdungsermittlung',
		row_index: 0,
		column_position: 'full',
		field_options: { options: GEFAEHRDUNGSFAKTOR_OPTIONS }
	});
	fields.set('gefaehrdungsfaktor', gefFaktorField.id);

	// smart_dropdown: Detailtyp depends on Gefaehrdungsfaktor
	const detailtypField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Detailtyp',
		field_type: 'smart_dropdown',
		is_required: true,
		field_order: 2,
		page: 1,
		row_index: 1,
		column_position: 'full',
		field_options: {
			source_field: gefFaktorField.id,
			mappings: DETAILTYP_MAPPINGS
		}
	});
	fields.set('detailtyp', detailtypField.id);

	const raumField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Raum',
		field_type: 'short_text',
		is_required: true,
		field_order: 3,
		page: 1,
		row_index: 2,
		column_position: 'full'
	});
	fields.set('raum', raumField.id);

	// Page 2: Risikobewertung (Nohl)
	const eintrittsField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Eintrittswahrscheinlichkeit',
		field_type: 'dropdown',
		is_required: true,
		field_order: 4,
		page: 2,
		page_title: 'Risikobewertung',
		row_index: 0,
		column_position: 'left',
		help_text: 'Nohl-Skala: 1 (sehr gering) bis 4 (hoch)',
		field_options: { options: EINTRITTSWAHRSCHEINLICHKEIT_OPTIONS }
	});
	fields.set('eintrittswahrscheinlichkeit', eintrittsField.id);

	const schwereField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Schadensschwere',
		field_type: 'dropdown',
		is_required: true,
		field_order: 5,
		page: 2,
		row_index: 0,
		column_position: 'right',
		help_text: 'Nohl-Skala: 1 (leicht) bis 4 (Tod)',
		field_options: { options: SCHADENSSCHWERE_OPTIONS }
	});
	fields.set('schadensschwere', schwereField.id);

	// Calculated fields
	const risikomasszahlField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Risikomasszahl',
		field_type: 'number',
		is_required: false,
		field_order: 6,
		page: 2,
		row_index: 1,
		column_position: 'left',
		help_text: 'Automatisch: E + S - 1 (Nohl, Spanne 1-7)'
	});
	fields.set('risikomasszahl', risikomasszahlField.id);

	const risikoklasseField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Risikoklasse',
		field_type: 'dropdown',
		is_required: false,
		field_order: 7,
		page: 2,
		row_index: 1,
		column_position: 'right',
		help_text: 'Automatisch: Gering / Erheblich / Hoch',
		field_options: { options: RISIKOKLASSE_OPTIONS }
	});
	fields.set('risikoklasse', risikoklasseField.id);

	// Page 3: Dokumentation
	const fotoField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Foto',
		field_type: 'file',
		is_required: false,
		field_order: 8,
		page: 3,
		page_title: 'Dokumentation',
		row_index: 0,
		column_position: 'full'
	});
	fields.set('foto', fotoField.id);

	const beschreibungField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Beschreibung',
		field_type: 'long_text',
		is_required: false,
		field_order: 9,
		page: 3,
		row_index: 1,
		column_position: 'full'
	});
	fields.set('beschreibung', beschreibungField.id);

	// --- Transition form (-> Behoben): T-O-P Massnahmen ---
	const behobentConnId = connectionIds.get('Massnahme geplant->Behoben')!;
	const transitionForm = await pb.collection('tools_forms').create({
		workflow_id: wf.id,
		connection_id: behobentConnId,
		name: 'Massnahmen-Dokumentation',
		description: 'T-O-P Massnahme dokumentieren'
	});

	await pb.collection('tools_form_fields').create({
		form_id: transitionForm.id,
		field_label: 'Massnahmenart',
		field_type: 'dropdown',
		is_required: true,
		field_order: 1,
		page: 1,
		row_index: 0,
		column_position: 'full',
		help_text: 'T-O-P Prinzip nach BetrSichV',
		field_options: { options: MASSNAHMENART_OPTIONS }
	});

	await pb.collection('tools_form_fields').create({
		form_id: transitionForm.id,
		field_label: 'Massnahmenbeschreibung',
		field_type: 'long_text',
		is_required: true,
		field_order: 2,
		page: 1,
		row_index: 1,
		column_position: 'full'
	});

	await pb.collection('tools_form_fields').create({
		form_id: transitionForm.id,
		field_label: 'Nachweisfoto',
		field_type: 'file',
		is_required: false,
		field_order: 3,
		page: 1,
		row_index: 2,
		column_position: 'full'
	});

	// --- Filterable tag on Risikoklasse ---
	await pb.collection('tools_field_tags').create({
		workflow_id: wf.id,
		tag_mappings: [
			{
				tagType: 'filterable',
				fieldId: risikoklasseField.id,
				config: { filterBy: 'field' }
			}
		]
	});

	// filter_value_icons
	await pb.collection('workflows').update(wf.id, {
		filter_value_icons: {
			'Gering': pinIcon(COLORS.GREEN),
			'Erheblich': pinIcon(COLORS.ORANGE),
			'Hoch': pinIcon(COLORS.RED)
		}
	});

	// --- Automations ---
	const automations: Array<{ id: string; name: string }> = [];

	// 1. on_field_change (E or S) -> risikomasszahl = E + S - 1
	for (const triggerKey of ['eintrittswahrscheinlichkeit', 'schadensschwere']) {
		const auto = await pb.collection('tools_automation').create({
			workflow_id: wf.id,
			name: `Risikomasszahl berechnen (${triggerKey})`,
			trigger_type: 'on_field_change',
			trigger_config: {
				field_key: fields.get(triggerKey)!,
				stage_id: null
			},
			steps: [{ name: 'Main', conditions: null, actions: [
				{
					type: 'set_field_value',
					params: {
						field_key: fields.get('risikomasszahl')!,
						value: `{${fields.get('eintrittswahrscheinlichkeit')!}} + {${fields.get('schadensschwere')!}} - 1`,
						stage_id: null
					}
				}
			] }],
			is_enabled: true
		});
		automations.push({ id: auto.id, name: auto.name });
	}

	// 2. on_field_change (risikomasszahl) -> classify risikoklasse + auto-transition
	const risikoklasseAuto = await pb.collection('tools_automation').create({
		workflow_id: wf.id,
		name: 'Risikoklasse bestimmen',
		trigger_type: 'on_field_change',
		trigger_config: {
			field_key: fields.get('risikomasszahl')!,
			stage_id: null
		},
		steps: [
			{
				name: 'Hoch',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('risikomasszahl')!, operator: 'gte', value: '5' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('risikoklasse')!, value: 'Hoch' } },
					{ type: 'set_stage', params: { stage_id: stages.get('Massnahme geplant')! } }
				]
			},
			{
				name: 'Erheblich',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('risikomasszahl')!, operator: 'gte', value: '3' } },
						{ type: 'field_value', params: { field_key: fields.get('risikomasszahl')!, operator: 'lt', value: '5' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('risikoklasse')!, value: 'Erheblich' } }
				]
			},
			{
				name: 'Gering',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('risikomasszahl')!, operator: 'lt', value: '3' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('risikoklasse')!, value: 'Gering' } }
				]
			}
		],
		is_enabled: true
	});
	automations.push({ id: risikoklasseAuto.id, name: risikoklasseAuto.name });

	// --- Create instances as participant (automations calculate derived fields) ---
	const instances: Array<{ id: string }> = [];
	const participantId = createdParticipants[0].id;
	const erfasstStageId = stages.get('Erfasst')!;

	const participantPb = await createParticipantClient(createdParticipants[0].token);

	for (const inst of SICHERHEIT_INSTANCES) {
		const coord = SICHERHEIT_COORDINATES[inst.coordIndex];

		// Only submit user-input fields; automations will calculate:
		// E or S -> risikomasszahl -> risikoklasse -> maybe auto-transition
		const { instanceId } = await submitEntryForm(participantPb, {
			workflowId: wf.id,
			startStageId: erfasstStageId,
			participantId,
			location: { lat: coord.lat, lon: coord.lon },
			fieldValues: [
				{ key: fields.get('gefaehrdungsfaktor')!, value: inst.gefaehrdungsfaktor },
				{ key: fields.get('detailtyp')!, value: inst.detailtyp },
				{ key: fields.get('raum')!, value: inst.raum },
				{ key: fields.get('eintrittswahrscheinlichkeit')!, value: inst.eintrittswahrscheinlichkeit },
				{ key: fields.get('schadensschwere')!, value: inst.schadensschwere },
				{ key: fields.get('beschreibung')!, value: inst.beschreibung }
			]
		});

		instances.push({ id: instanceId });
	}

	console.log(`Created workflow with ${instances.length} instances, ${automations.length} automations`);

	return {
		projectId: project.id,
		roles: createdRoles,
		participants: createdParticipants,
		workflow: {
			id: wf.id,
			name: wf.name,
			stages,
			entryConnectionId,
			automations,
			instances,
			fields
		},
		customTable: { id: customTable.id, name: 'Massnahmenkatalog' }
	};
}

// ---------------------------------------------------------------------------
// Standalone execution: npx tsx e2e/api-seed-sicherheit.ts
// ---------------------------------------------------------------------------

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
	seedSicherheit()
		.then((result) => {
			console.log('\nSeeding Sicherheitsbegehung complete!');
			console.log(`Project ID: ${result.projectId}`);
			console.log(`Workflow: ${result.workflow.name} (${result.workflow.id})`);
			console.log(`  Instances: ${result.workflow.instances.length}`);
			console.log(`  Automations: ${result.workflow.automations.length}`);
			console.log(`Custom Table: ${result.customTable.name} (${result.customTable.id})`);
			console.log('\nParticipant tokens:');
			result.participants.forEach((p) => console.log(`  ${p.name}: ${p.token}`));
			process.exit(0);
		})
		.catch((error) => {
			console.error('Seeding failed:', error);
			process.exit(1);
		});
}
