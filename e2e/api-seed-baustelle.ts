import PocketBase from 'pocketbase';
import {
	ADMIN_CREDENTIALS,
	BAUSTELLE_PROJECT,
	BAUSTELLE_ROLES,
	BAUSTELLE_PARTICIPANTS,
	BAUSTELLE_STAGES,
	BAUSTELLE_CONNECTIONS,
	BAUPHASE_OPTIONS,
	GEWERK_MAPPINGS,
	PRIORITAET_OPTIONS,
	KONSENS_OPTIONS,
	FIRMEN_COLUMNS,
	FIRMEN_DATA,
	BAUSTELLE_COORDINATES,
	BAUSTELLE_INSTANCES
} from './fixtures/baustelle-data';
import { pinIcon, COLORS } from './fixtures/shared-svg';
import { PB_URL, generateToken, createParticipantClient, submitEntryForm, executeTransition, fillStageForm } from './seed-helpers';

export interface BaustelleSeedResult {
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

export async function seedBaustelle(): Promise<BaustelleSeedResult> {
	const pb = new PocketBase(PB_URL);

	// Auth
	await pb.collection('users').authWithPassword(
		ADMIN_CREDENTIALS.email,
		ADMIN_CREDENTIALS.password
	);
	const userId = pb.authStore.record?.id;
	if (!userId) throw new Error('Failed to get authenticated user ID');

	// Project
	const uniqueName = `${BAUSTELLE_PROJECT.name} ${Date.now().toString().slice(-6)}`;
	const project = await pb.collection('projects').create({
		name: uniqueName,
		description: BAUSTELLE_PROJECT.description,
		owner_id: userId,
		is_active: true
	});
	console.log(`Created project: ${project.id} (${uniqueName})`);

	// Roles
	const createdRoles: Array<{ id: string; name: string }> = [];
	for (const role of BAUSTELLE_ROLES) {
		const created = await pb.collection('roles').create({
			project_id: project.id,
			name: role.name,
			description: role.description
		});
		createdRoles.push({ id: created.id, name: created.name });
		console.log(`Created role: ${created.name}`);
	}

	const roleId = (name: string) => createdRoles.find((r) => r.name === name)!.id;
	const oueRoleId = roleId('Objektueberwacher');
	const piRoleId = roleId('Pruefingenieur');
	const bauleiterRoleId = roleId('Bauleiter');

	// Participants
	const createdParticipants: Array<{ id: string; name: string; token: string }> = [];
	const timestamp = Date.now().toString().slice(-6);
	for (const p of BAUSTELLE_PARTICIPANTS) {
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

	// --- Custom Table: Beteiligte Firmen ---
	const customTable = await pb.collection('custom_tables').create({
		project_id: project.id,
		table_name: 'beteiligte_firmen',
		display_name: 'Beteiligte Firmen',
		description: 'Subunternehmer und ihre Gewerke',
		main_column: 'firma',
		visible_to_roles: []
	});

	for (const col of FIRMEN_COLUMNS) {
		await pb.collection('custom_table_columns').create({
			table_id: customTable.id,
			column_name: col.column_name,
			column_type: col.column_type,
			is_required: col.is_required,
			sort_order: FIRMEN_COLUMNS.indexOf(col)
		});
	}

	for (const row of FIRMEN_DATA) {
		await pb.collection('custom_table_data').create({
			table_id: customTable.id,
			row_data: row
		});
	}
	console.log(`Created custom table: Beteiligte Firmen with ${FIRMEN_DATA.length} rows`);

	// --- Workflow ---
	const wf = await pb.collection('workflows').create({
		project_id: project.id,
		name: 'Maengelbewertung',
		description: 'Blinde Doppelbewertung mit Konsens-Mechanismus',
		workflow_type: 'incident',
		is_active: true,
		entry_allowed_roles: [oueRoleId, piRoleId, bauleiterRoleId],
		marker_color: '#f59e0b',
		icon_config: {}
	});

	// Stages with visible_to_roles for blinding
	const stages = new Map<string, string>();
	for (let idx = 0; idx < BAUSTELLE_STAGES.length; idx++) {
		const stageDef = BAUSTELLE_STAGES[idx];
		// Blinding: Bewertung OUe visible to OUe + Bauleiter, Bewertung PI to PI + Bauleiter
		let visibleToRoles: string[] = [];
		if (stageDef.name === 'Bewertung OUe') {
			visibleToRoles = [oueRoleId, bauleiterRoleId];
		} else if (stageDef.name === 'Bewertung PI') {
			visibleToRoles = [piRoleId, bauleiterRoleId];
		}
		// All other stages: [] = visible to all

		const stage = await pb.collection('workflow_stages').create({
			workflow_id: wf.id,
			stage_name: stageDef.name,
			stage_type: stageDef.type,
			stage_order: idx,
			position_x: stageDef.x,
			position_y: stageDef.y,
			visible_to_roles: visibleToRoles,
			visual_config: {}
		});
		stages.set(stageDef.name, stage.id);
	}

	// Connections
	let entryConnectionId = '';
	const connectionIds = new Map<string, string>();
	for (const connDef of BAUSTELLE_CONNECTIONS) {
		const fromStageId = connDef.from ? stages.get(connDef.from) : null;
		const toStageId = stages.get(connDef.to)!;
		const isEntry = !connDef.from;

		const visualConfig: Record<string, unknown> = {
			button_label: isEntry ? 'Mangel melden' : connDef.action
		};
		if (connDef.to === 'Abgenommen') {
			visualConfig.requires_confirmation = 'Mangel wird als ABGENOMMEN dokumentiert. Gewaehrleistungsfrist beginnt (4 Jahre VOB/B, 5 Jahre BGB).';
		}

		const conn = await pb.collection('workflow_connections').create({
			workflow_id: wf.id,
			from_stage_id: fromStageId ?? null,
			to_stage_id: toStageId,
			action_name: connDef.action,
			allowed_roles: [],
			visual_config: visualConfig
		});
		if (isEntry) entryConnectionId = conn.id;
		const key = connDef.from ? `${connDef.from}->${connDef.to}` : 'entry';
		connectionIds.set(key, conn.id);
	}

	// --- Entry Form (Page 1: Mangel, Page 2: Subunternehmer) ---
	const entryForm = await pb.collection('tools_forms').create({
		workflow_id: wf.id,
		connection_id: entryConnectionId,
		name: 'Mangelerfassung',
		description: 'Bauphase, Gewerk, Beschreibung und Subunternehmer'
	});

	const fields = new Map<string, string>();

	const bauphaseField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Bauphase',
		field_type: 'dropdown',
		is_required: true,
		field_order: 1,
		page: 1,
		page_title: 'Mangel',
		row_index: 0,
		column_position: 'left',
		field_options: { options: BAUPHASE_OPTIONS }
	});
	fields.set('bauphase', bauphaseField.id);

	// smart_dropdown: Gewerk depends on Bauphase
	const gewerkField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Gewerk',
		field_type: 'smart_dropdown',
		is_required: true,
		field_order: 2,
		page: 1,
		row_index: 0,
		column_position: 'right',
		field_options: {
			source_field: bauphaseField.id,
			mappings: GEWERK_MAPPINGS
		}
	});
	fields.set('gewerk', gewerkField.id);

	const beschreibungField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Beschreibung',
		field_type: 'long_text',
		is_required: true,
		field_order: 3,
		page: 1,
		row_index: 1,
		column_position: 'full'
	});
	fields.set('beschreibung', beschreibungField.id);

	const fotoField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Foto',
		field_type: 'file',
		is_required: false,
		field_order: 4,
		page: 1,
		row_index: 2,
		column_position: 'full'
	});
	fields.set('foto', fotoField.id);

	// Page 2: Subunternehmer (custom_table_selector)
	const subunternehmerField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Subunternehmer',
		field_type: 'custom_table_selector',
		is_required: false,
		field_order: 5,
		page: 2,
		page_title: 'Zuordnung',
		row_index: 0,
		column_position: 'full',
		field_options: {
			source_type: 'custom_table',
			custom_table_id: customTable.id,
			display_field: 'firma',
			value_field: 'firma'
		}
	});
	fields.set('subunternehmer', subunternehmerField.id);

	// --- Stage-attached forms for blind evaluation ---

	// OUe Bewertung form (stage-attached, allowed_roles: OUe only)
	const oueForm = await pb.collection('tools_forms').create({
		workflow_id: wf.id,
		stage_id: stages.get('Bewertung OUe')!,
		name: 'Bewertung Objektueberwacher',
		description: 'Einstufung und Dringlichkeit durch OUe',
		allowed_roles: [oueRoleId],
		visual_config: {}
	});

	const einstufungOueField = await pb.collection('tools_form_fields').create({
		form_id: oueForm.id,
		field_label: 'Einstufung OUe',
		field_type: 'number',
		is_required: true,
		field_order: 1,
		page: 1,
		row_index: 0,
		column_position: 'left',
		help_text: '0 = unwesentlich, 1 = wesentlich (VOB/B)',
		validation_rules: { min: 0, max: 1 }
	});
	fields.set('einstufung_oue', einstufungOueField.id);

	const dringlichkeitOueField = await pb.collection('tools_form_fields').create({
		form_id: oueForm.id,
		field_label: 'Dringlichkeit OUe',
		field_type: 'number',
		is_required: true,
		field_order: 2,
		page: 1,
		row_index: 0,
		column_position: 'right',
		help_text: '1 = sofort, 2 = zeitnah, 3 = vor Abnahme',
		validation_rules: { min: 1, max: 3 }
	});
	fields.set('dringlichkeit_oue', dringlichkeitOueField.id);

	// PI Bewertung form (stage-attached, allowed_roles: PI only)
	const piForm = await pb.collection('tools_forms').create({
		workflow_id: wf.id,
		stage_id: stages.get('Bewertung PI')!,
		name: 'Bewertung Pruefingenieur',
		description: 'Einstufung und Dringlichkeit durch PI',
		allowed_roles: [piRoleId],
		visual_config: {}
	});

	const einstufungPiField = await pb.collection('tools_form_fields').create({
		form_id: piForm.id,
		field_label: 'Einstufung PI',
		field_type: 'number',
		is_required: true,
		field_order: 1,
		page: 1,
		row_index: 0,
		column_position: 'left',
		help_text: '0 = unwesentlich, 1 = wesentlich (VOB/B)',
		validation_rules: { min: 0, max: 1 }
	});
	fields.set('einstufung_pi', einstufungPiField.id);

	const dringlichkeitPiField = await pb.collection('tools_form_fields').create({
		form_id: piForm.id,
		field_label: 'Dringlichkeit PI',
		field_type: 'number',
		is_required: true,
		field_order: 2,
		page: 1,
		row_index: 0,
		column_position: 'right',
		help_text: '1 = sofort, 2 = zeitnah, 3 = vor Abnahme',
		validation_rules: { min: 1, max: 3 }
	});
	fields.set('dringlichkeit_pi', dringlichkeitPiField.id);

	// --- Calculated fields (on entry form so they're globally visible) ---
	const einstufungDiffField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Einstufung Differenz',
		field_type: 'number',
		is_required: false,
		field_order: 10,
		page: 2,
		row_index: 1,
		column_position: 'left',
		help_text: 'Automatisch: OUe - PI (0 = Einigkeit)'
	});
	fields.set('einstufung_differenz', einstufungDiffField.id);

	const dringlichkeitSchnittField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Dringlichkeit Schnitt',
		field_type: 'number',
		is_required: false,
		field_order: 11,
		page: 2,
		row_index: 1,
		column_position: 'right',
		help_text: 'Automatisch: Durchschnitt beider Dringlichkeiten'
	});
	fields.set('dringlichkeit_schnitt', dringlichkeitSchnittField.id);

	const konsensField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Konsens',
		field_type: 'dropdown',
		is_required: false,
		field_order: 12,
		page: 2,
		row_index: 2,
		column_position: 'left',
		help_text: 'Automatisch: Einig oder Strittig',
		field_options: { options: KONSENS_OPTIONS }
	});
	fields.set('konsens', konsensField.id);

	const prioritaetField = await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Prioritaet',
		field_type: 'dropdown',
		is_required: false,
		field_order: 13,
		page: 2,
		row_index: 2,
		column_position: 'right',
		help_text: 'Automatisch: Sofort / Zeitnah / Vor Abnahme',
		field_options: { options: PRIORITAET_OPTIONS }
	});
	fields.set('prioritaet', prioritaetField.id);

	// --- Transition form (-> Abgenommen) ---
	const abgenommenConnId = connectionIds.get('In Nachbesserung->Abgenommen')!;
	const abnahmeForm = await pb.collection('tools_forms').create({
		workflow_id: wf.id,
		connection_id: abgenommenConnId,
		name: 'Abnahme-Dokumentation',
		description: 'Abnahmefoto und Bestaetigung'
	});

	await pb.collection('tools_form_fields').create({
		form_id: abnahmeForm.id,
		field_label: 'Abnahme-Foto',
		field_type: 'file',
		is_required: false,
		field_order: 1,
		page: 1,
		row_index: 0,
		column_position: 'full'
	});

	// --- Filterable tag on Prioritaet ---
	await pb.collection('tools_field_tags').create({
		workflow_id: wf.id,
		tag_mappings: [
			{
				tagType: 'filterable',
				fieldId: prioritaetField.id,
				config: { filterBy: 'field' }
			}
		]
	});

	// filter_value_icons
	await pb.collection('workflows').update(wf.id, {
		filter_value_icons: {
			'Sofort': pinIcon(COLORS.RED),
			'Zeitnah': pinIcon(COLORS.ORANGE),
			'Vor Abnahme': pinIcon(COLORS.YELLOW)
		}
	});

	// --- Automations (consolidated: same trigger_config = single automation with multiple steps) ---
	const automations: Array<{ id: string; name: string }> = [];

	// 1. trigger: einstufung_pi -- compute both derived fields in one step with 2 actions
	const bewertungAuto = await pb.collection('tools_automation').create({
		workflow_id: wf.id,
		name: 'Bewertung berechnen',
		trigger_type: 'on_field_change',
		trigger_config: {
			field_key: fields.get('einstufung_pi')!,
			stage_id: null
		},
		steps: [{
			name: 'Differenz + Schnitt berechnen',
			conditions: null,
			actions: [
				{
					type: 'set_field_value',
					params: {
						field_key: fields.get('einstufung_differenz')!,
						value: `{${fields.get('einstufung_oue')!}} - {${fields.get('einstufung_pi')!}}`,
						stage_id: null
					}
				},
				{
					type: 'set_field_value',
					params: {
						field_key: fields.get('dringlichkeit_schnitt')!,
						value: `({${fields.get('dringlichkeit_oue')!}} + {${fields.get('dringlichkeit_pi')!}}) / 2`,
						stage_id: null
					}
				}
			]
		}],
		is_enabled: true
	});
	automations.push({ id: bewertungAuto.id, name: bewertungAuto.name });

	// 2. trigger: einstufung_differenz -- 2 steps: Strittig (diff != 0) and Einig (diff == 0, + auto-transition)
	const konsensAuto = await pb.collection('tools_automation').create({
		workflow_id: wf.id,
		name: 'Konsens-Check',
		trigger_type: 'on_field_change',
		trigger_config: {
			field_key: fields.get('einstufung_differenz')!,
			stage_id: null
		},
		steps: [
			{
				name: 'Strittig',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('einstufung_differenz')!, operator: 'not_equals', value: '0' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('konsens')!, value: 'Strittig' } }
				]
			},
			{
				name: 'Einig -> Auswertung',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('einstufung_differenz')!, operator: 'equals', value: '0' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('konsens')!, value: 'Einig' } },
					{ type: 'set_stage', params: { stage_id: stages.get('Auswertung')! } }
				]
			}
		],
		is_enabled: true
	});
	automations.push({ id: konsensAuto.id, name: konsensAuto.name });

	// 3. trigger: dringlichkeit_schnitt -- 3 steps: Sofort (<=1), Zeitnah (>1 && <=2), Vor Abnahme (>2)
	const prioAuto = await pb.collection('tools_automation').create({
		workflow_id: wf.id,
		name: 'Prioritaet bestimmen',
		trigger_type: 'on_field_change',
		trigger_config: {
			field_key: fields.get('dringlichkeit_schnitt')!,
			stage_id: null
		},
		steps: [
			{
				name: 'Sofort',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('dringlichkeit_schnitt')!, operator: 'lte', value: '1' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('prioritaet')!, value: 'Sofort' } }
				]
			},
			{
				name: 'Zeitnah',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('dringlichkeit_schnitt')!, operator: 'gt', value: '1' } },
						{ type: 'field_value', params: { field_key: fields.get('dringlichkeit_schnitt')!, operator: 'lte', value: '2' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('prioritaet')!, value: 'Zeitnah' } }
				]
			},
			{
				name: 'Vor Abnahme',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('dringlichkeit_schnitt')!, operator: 'gt', value: '2' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('prioritaet')!, value: 'Vor Abnahme' } }
				]
			}
		],
		is_enabled: true
	});
	automations.push({ id: prioAuto.id, name: prioAuto.name });

	// 4. trigger: on_transition to Abgenommen -> set_instance_status: completed (different trigger type, stays separate)
	const completedAuto = await pb.collection('tools_automation').create({
		workflow_id: wf.id,
		name: 'Abnahme -> Status completed',
		trigger_type: 'on_transition',
		trigger_config: {
			from_stage_id: stages.get('In Nachbesserung')!,
			to_stage_id: stages.get('Abgenommen')!
		},
		steps: [{ name: 'Main', conditions: null, actions: [
			{ type: 'set_instance_status', params: { status: 'completed' } }
		] }],
		is_enabled: true
	});
	automations.push({ id: completedAuto.id, name: completedAuto.name });

	// --- Create instances via multi-step flow ---
	const instances: Array<{ id: string }> = [];

	// Authenticate participants
	const oueParticipant = createdParticipants.find(p => p.name === 'Frank Bauer')!;
	const piParticipant = createdParticipants.find(p => p.name === 'Dr. Eva Statik')!;
	const oueClientPb = await createParticipantClient(oueParticipant.token);
	const piClientPb = await createParticipantClient(piParticipant.token);

	const gemeldetStageId = stages.get('Gemeldet')!;
	const bewertungOueStageId = stages.get('Bewertung OUe')!;
	const bewertungPiStageId = stages.get('Bewertung PI')!;

	// Connection IDs for transitions
	const entryToOueConnId = connectionIds.get('Gemeldet->Bewertung OUe')!;
	const oueToPiConnId = connectionIds.get('Bewertung OUe->Bewertung PI')!;

	for (const inst of BAUSTELLE_INSTANCES) {
		const coord = BAUSTELLE_COORDINATES[inst.coordIndex];

		// Step 1: Entry form (as OUe participant) at Gemeldet stage
		const { instanceId } = await submitEntryForm(oueClientPb, {
			workflowId: wf.id,
			startStageId: gemeldetStageId,
			participantId: oueParticipant.id,
			location: { lat: coord.lat, lon: coord.lon },
			fieldValues: [
				{ key: fields.get('bauphase')!, value: inst.bauphase },
				{ key: fields.get('gewerk')!, value: inst.gewerk },
				{ key: fields.get('beschreibung')!, value: inst.beschreibung }
			]
		});

		// Step 2: Transition Gemeldet -> Bewertung OUe (no form)
		await executeTransition(oueClientPb, {
			instanceId,
			fromStageId: gemeldetStageId,
			toStageId: bewertungOueStageId,
			connectionId: entryToOueConnId,
			participantId: oueParticipant.id
		});

		// Step 3: Fill OUe stage form
		await fillStageForm(oueClientPb, {
			instanceId,
			stageId: bewertungOueStageId,
			participantId: oueParticipant.id,
			fieldValues: [
				{ key: fields.get('einstufung_oue')!, value: String(inst.einstufung_oue) },
				{ key: fields.get('dringlichkeit_oue')!, value: String(inst.dringlichkeit_oue) }
			]
		});

		// Step 4: Transition Bewertung OUe -> Bewertung PI (no form)
		await executeTransition(oueClientPb, {
			instanceId,
			fromStageId: bewertungOueStageId,
			toStageId: bewertungPiStageId,
			connectionId: oueToPiConnId,
			participantId: oueParticipant.id
		});

		// Step 5: Fill PI stage form (dringlichkeit_pi FIRST, then einstufung_pi)
		// Order matters: automations trigger on einstufung_pi and need dringlichkeit_pi
		await fillStageForm(piClientPb, {
			instanceId,
			stageId: bewertungPiStageId,
			participantId: piParticipant.id,
			fieldValues: [
				{ key: fields.get('dringlichkeit_pi')!, value: String(inst.dringlichkeit_pi) },
				{ key: fields.get('einstufung_pi')!, value: String(inst.einstufung_pi) }
			]
		});

		// Step 6: Automations fire naturally:
		// einstufung_pi -> einstufung_differenz + dringlichkeit_schnitt
		// -> konsens + prioritaet -> maybe auto-transition to Auswertung

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
		customTable: { id: customTable.id, name: 'Beteiligte Firmen' }
	};
}

// ---------------------------------------------------------------------------
// Standalone execution: npx tsx e2e/api-seed-baustelle.ts
// ---------------------------------------------------------------------------

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
	seedBaustelle()
		.then((result) => {
			console.log('\nSeeding Baustelle complete!');
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
