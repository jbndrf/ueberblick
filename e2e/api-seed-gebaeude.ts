import PocketBase from 'pocketbase';
import {
	ADMIN_CREDENTIALS,
	GEBAEUDE_PROJECT,
	GEBAEUDE_ROLES,
	GEBAEUDE_PARTICIPANTS,
	GEBAEUDE_WORKFLOWS,
	GEBAEUDE_STAGES,
	GEBAEUDE_CONNECTIONS,
	NUTZUNGSART_OPTIONS,
	ZUSTANDSKLASSE_OPTIONS,
	BUILDING_COORDINATES,
	BUILDING_ROOMS
} from './fixtures/gebaeude-data';
import { pinIcon, COLORS } from './fixtures/shared-svg';
import { PB_URL, generateToken, createParticipantClient, submitEntryForm } from './seed-helpers';

export interface GebaeudeSeedResult {
	projectId: string;
	roles: Array<{ id: string; name: string }>;
	participants: Array<{ id: string; name: string; token: string }>;
	workflows: Array<{
		id: string;
		name: string;
		stages: Map<string, string>;
		entryConnectionId: string;
		automations: Array<{ id: string; name: string }>;
		instances: Array<{ id: string; raumnummer: string }>;
		fields: Map<string, string>;
	}>;
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

export async function seedGebaeude(): Promise<GebaeudeSeedResult> {
	const pb = new PocketBase(PB_URL);

	// Auth
	await pb.collection('users').authWithPassword(
		ADMIN_CREDENTIALS.email,
		ADMIN_CREDENTIALS.password
	);
	const userId = pb.authStore.record?.id;
	if (!userId) throw new Error('Failed to get authenticated user ID');

	// Project
	const uniqueName = `${GEBAEUDE_PROJECT.name} ${Date.now().toString().slice(-6)}`;
	const project = await pb.collection('projects').create({
		name: uniqueName,
		description: GEBAEUDE_PROJECT.description,
		owner_id: userId,
		is_active: true
	});
	console.log(`Created project: ${project.id} (${uniqueName})`);

	// Roles
	const createdRoles: Array<{ id: string; name: string }> = [];
	for (const role of GEBAEUDE_ROLES) {
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
	for (const p of GEBAEUDE_PARTICIPANTS) {
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
	const allRoleIds = createdRoles.map((r) => r.id);

	// =======================================================================
	// Create 3 identical workflows (one per building)
	// =======================================================================

	const workflowResults: GebaeudeSeedResult['workflows'] = [];
	let participantPb: PocketBase | null = null;

	for (let wIdx = 0; wIdx < GEBAEUDE_WORKFLOWS.length; wIdx++) {
		const wfDef = GEBAEUDE_WORKFLOWS[wIdx];
		const coords = BUILDING_COORDINATES[wIdx];
		const rooms = BUILDING_ROOMS[wIdx];

		// Workflow
		const wf = await pb.collection('workflows').create({
			project_id: project.id,
			name: wfDef.name,
			description: wfDef.description,
			workflow_type: 'incident',
			is_active: true,
			entry_allowed_roles: allRoleIds,
			marker_color: wfDef.marker_color,
			icon_config: {}
		});

		// Stages
		const stages = new Map<string, string>();
		for (let idx = 0; idx < GEBAEUDE_STAGES.length; idx++) {
			const stageDef = GEBAEUDE_STAGES[idx];
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
		for (const connDef of GEBAEUDE_CONNECTIONS) {
			const fromStageId = connDef.from ? stages.get(connDef.from) : null;
			const toStageId = stages.get(connDef.to)!;
			const isEntry = !connDef.from;
			const conn = await pb.collection('workflow_connections').create({
				workflow_id: wf.id,
				from_stage_id: fromStageId ?? null,
				to_stage_id: toStageId,
				action_name: connDef.action,
				allowed_roles: [],
				visual_config: { button_label: isEntry ? `Raum in ${wfDef.name} erfassen` : connDef.action }
			});
			if (isEntry) entryConnectionId = conn.id;
		}

		// Entry form
		const entryForm = await pb.collection('tools_forms').create({
			workflow_id: wf.id,
			connection_id: entryConnectionId,
			name: 'Raum-Erfassung',
			description: 'Raumnummer, Nutzungsart und Zustandsbewertung'
		});

		const fields = new Map<string, string>();

		// Page 1: Raum
		const raumnummerField = await pb.collection('tools_form_fields').create({
			form_id: entryForm.id,
			field_label: 'Raumnummer',
			field_type: 'short_text',
			is_required: true,
			field_order: 1,
			page: 1,
			page_title: 'Raum',
			row_index: 0,
			column_position: 'left'
		});
		fields.set('raumnummer', raumnummerField.id);

		const nutzungsartField = await pb.collection('tools_form_fields').create({
			form_id: entryForm.id,
			field_label: 'Nutzungsart',
			field_type: 'dropdown',
			is_required: true,
			field_order: 2,
			page: 1,
			row_index: 0,
			column_position: 'right',
			field_options: { options: NUTZUNGSART_OPTIONS }
		});
		fields.set('nutzungsart', nutzungsartField.id);

		// Page 2: Zustandsbewertung
		const baukonstruktionField = await pb.collection('tools_form_fields').create({
			form_id: entryForm.id,
			field_label: 'Baukonstruktion',
			field_type: 'number',
			is_required: true,
			field_order: 3,
			page: 2,
			page_title: 'Zustandsbewertung',
			row_index: 0,
			column_position: 'full',
			help_text: 'Waende, Decken, Boeden, Fenster -- Note 1 (sehr gut) bis 4 (ungenuegend)',
			validation_rules: { min: 1, max: 4 }
		});
		fields.set('baukonstruktion', baukonstruktionField.id);

		const tgaField = await pb.collection('tools_form_fields').create({
			form_id: entryForm.id,
			field_label: 'TGA',
			field_type: 'number',
			is_required: true,
			field_order: 4,
			page: 2,
			row_index: 1,
			column_position: 'full',
			help_text: 'Heizung, Elektro, Sanitaer-Installationen, Lueftung -- Note 1-4',
			validation_rules: { min: 1, max: 4 }
		});
		fields.set('tga', tgaField.id);

		const raumausstattungField = await pb.collection('tools_form_fields').create({
			form_id: entryForm.id,
			field_label: 'Raumausstattung',
			field_type: 'number',
			is_required: true,
			field_order: 5,
			page: 2,
			row_index: 2,
			column_position: 'full',
			help_text: 'Moeblierung, Oberflaechen, Beschilderung -- Note 1-4',
			validation_rules: { min: 1, max: 4 }
		});
		fields.set('raumausstattung', raumausstattungField.id);

		// Calculated fields
		const zustandsindexField = await pb.collection('tools_form_fields').create({
			form_id: entryForm.id,
			field_label: 'Zustandsindex',
			field_type: 'number',
			is_required: false,
			field_order: 6,
			page: 2,
			row_index: 3,
			column_position: 'left',
			help_text: 'Automatisch: Durchschnitt der 3 Bewertungen'
		});
		fields.set('zustandsindex', zustandsindexField.id);

		const zustandsklasseField = await pb.collection('tools_form_fields').create({
			form_id: entryForm.id,
			field_label: 'Zustandsklasse',
			field_type: 'dropdown',
			is_required: false,
			field_order: 7,
			page: 2,
			row_index: 3,
			column_position: 'right',
			help_text: 'Automatisch: A/B/C/D',
			field_options: { options: ZUSTANDSKLASSE_OPTIONS }
		});
		fields.set('zustandsklasse', zustandsklasseField.id);

		// tools_edit: Inspekteure can update ratings at all stages
		const allStageIds = Array.from(stages.values());
		await pb.collection('tools_edit').create({
			name: 'Bewertung aktualisieren',
			stage_id: allStageIds,
			editable_fields: [baukonstruktionField.id, tgaField.id, raumausstattungField.id],
			allowed_roles: allRoleIds,
			edit_mode: 'form_fields',
			visual_config: {}
		});

		// Filterable tag on Zustandsklasse
		await pb.collection('tools_field_tags').create({
			workflow_id: wf.id,
			tag_mappings: [
				{
					tagType: 'filterable',
					fieldId: zustandsklasseField.id,
					config: { filterBy: 'field' }
				}
			]
		});

		// filter_value_icons
		await pb.collection('workflows').update(wf.id, {
			filter_value_icons: {
				'A': pinIcon(COLORS.GREEN),
				'B': pinIcon(COLORS.LIGHT_GREEN),
				'C': pinIcon(COLORS.ORANGE),
				'D': pinIcon(COLORS.RED)
			}
		});

		// --- Automations ---
		const automations: Array<{ id: string; name: string }> = [];

		// 1. on_field_change (any rating) -> zustandsindex = average
		for (const triggerKey of ['baukonstruktion', 'tga', 'raumausstattung']) {
			const auto = await pb.collection('tools_automation').create({
				workflow_id: wf.id,
				name: `Zustandsindex berechnen (${triggerKey})`,
				trigger_type: 'on_field_change',
				trigger_config: {
					field_key: fields.get(triggerKey)!,
					stage_id: null
				},
				steps: [{
					name: 'Main',
					conditions: null,
					actions: [
						{
							type: 'set_field_value',
							params: {
								field_key: fields.get('zustandsindex')!,
								value: `({${fields.get('baukonstruktion')!}} + {${fields.get('tga')!}} + {${fields.get('raumausstattung')!}}) / 3`,
								stage_id: null
							}
						}
					]
				}],
				is_enabled: true
			});
			automations.push({ id: auto.id, name: auto.name });
		}

		// 2. on_field_change (zustandsindex) -> classify + set_stage (4 steps in 1 automation)
		const zustandsklasseAuto = await pb.collection('tools_automation').create({
			workflow_id: wf.id,
			name: 'Zustandsklasse + Stage',
			trigger_type: 'on_field_change',
			trigger_config: { field_key: fields.get('zustandsindex')! },
			steps: [
				{
					name: 'A Einwandfrei',
					conditions: {
						operator: 'AND',
						conditions: [
							{ type: 'field_value', params: { field_key: fields.get('zustandsindex')!, operator: 'lt', value: '1.5' } }
						]
					},
					actions: [
						{ type: 'set_field_value', params: { field_key: fields.get('zustandsklasse')!, value: 'A' } },
						{ type: 'set_stage', params: { stage_id: stages.get('A Einwandfrei')! } }
					]
				},
				{
					name: 'B Gut',
					conditions: {
						operator: 'AND',
						conditions: [
							{ type: 'field_value', params: { field_key: fields.get('zustandsindex')!, operator: 'gte', value: '1.5' } },
							{ type: 'field_value', params: { field_key: fields.get('zustandsindex')!, operator: 'lt', value: '2.5' } }
						]
					},
					actions: [
						{ type: 'set_field_value', params: { field_key: fields.get('zustandsklasse')!, value: 'B' } },
						{ type: 'set_stage', params: { stage_id: stages.get('B Gut')! } }
					]
				},
				{
					name: 'C Mangelhaft',
					conditions: {
						operator: 'AND',
						conditions: [
							{ type: 'field_value', params: { field_key: fields.get('zustandsindex')!, operator: 'gte', value: '2.5' } },
							{ type: 'field_value', params: { field_key: fields.get('zustandsindex')!, operator: 'lt', value: '3.5' } }
						]
					},
					actions: [
						{ type: 'set_field_value', params: { field_key: fields.get('zustandsklasse')!, value: 'C' } },
						{ type: 'set_stage', params: { stage_id: stages.get('C Mangelhaft')! } }
					]
				},
				{
					name: 'D Ersatz',
					conditions: {
						operator: 'AND',
						conditions: [
							{ type: 'field_value', params: { field_key: fields.get('zustandsindex')!, operator: 'gte', value: '3.5' } }
						]
					},
					actions: [
						{ type: 'set_field_value', params: { field_key: fields.get('zustandsklasse')!, value: 'D' } },
						{ type: 'set_stage', params: { stage_id: stages.get('D Ersatz erforderlich')! } }
					]
				}
			],
			is_enabled: true
		});
		automations.push({ id: zustandsklasseAuto.id, name: zustandsklasseAuto.name });

		// 3. Sanitaer override: Sanitaer rooms with TGA >= 3 get forced to C
		const sanitaerOverride = await pb.collection('tools_automation').create({
			workflow_id: wf.id,
			name: 'Sanitaer-Override: TGA >= 3 -> Klasse C',
			trigger_type: 'on_field_change',
			trigger_config: { field_key: fields.get('tga')! },
			steps: [{
				name: 'Main',
				conditions: {
					operator: 'AND',
					conditions: [
						{ type: 'field_value', params: { field_key: fields.get('nutzungsart')!, operator: 'equals', value: 'Sanitaer' } },
						{ type: 'field_value', params: { field_key: fields.get('tga')!, operator: 'gte', value: '3' } }
					]
				},
				actions: [
					{ type: 'set_field_value', params: { field_key: fields.get('zustandsklasse')!, value: 'C' } },
					{ type: 'set_stage', params: { stage_id: stages.get('C Mangelhaft')! } }
				]
			}],
			is_enabled: true
		});
		automations.push({ id: sanitaerOverride.id, name: sanitaerOverride.name });

		// --- Create room instances as participant (automations calculate derived fields) ---
		const instances: Array<{ id: string; raumnummer: string }> = [];
		const startStageId = stages.get('A Einwandfrei')!;

		if (!participantPb) {
			participantPb = await createParticipantClient(createdParticipants[0].token);
		}

		for (const room of rooms) {
			const coord = coords[room.coordIndex];

			// Only submit user-input fields; automations will calculate:
			// any rating -> zustandsindex -> zustandsklasse + stage transition
			const { instanceId } = await submitEntryForm(participantPb, {
				workflowId: wf.id,
				startStageId,
				participantId,
				location: { lat: coord.lat, lon: coord.lon },
				fieldValues: [
					{ key: fields.get('raumnummer')!, value: room.raumnummer },
					{ key: fields.get('nutzungsart')!, value: room.nutzungsart },
					{ key: fields.get('baukonstruktion')!, value: String(room.baukonstruktion) },
					{ key: fields.get('tga')!, value: String(room.tga) },
					{ key: fields.get('raumausstattung')!, value: String(room.raumausstattung) }
				]
			});

			instances.push({ id: instanceId, raumnummer: room.raumnummer });
		}

		workflowResults.push({
			id: wf.id,
			name: wf.name,
			stages,
			entryConnectionId,
			automations,
			instances,
			fields
		});

		console.log(`[${wfDef.name}] Created ${instances.length} rooms, ${automations.length} automations`);
	}

	return {
		projectId: project.id,
		roles: createdRoles,
		participants: createdParticipants,
		workflows: workflowResults
	};
}

// ---------------------------------------------------------------------------
// Standalone execution: npx tsx e2e/api-seed-gebaeude.ts
// ---------------------------------------------------------------------------

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
	seedGebaeude()
		.then((result) => {
			console.log('\nSeeding Gebaeudemanagement complete!');
			console.log(`Project ID: ${result.projectId}`);
			result.workflows.forEach((wf) => {
				console.log(`\n${wf.name} (${wf.id}):`);
				console.log(`  Rooms: ${wf.instances.map((i) => i.raumnummer).join(', ')}`);
				console.log(`  Automations: ${wf.automations.length}`);
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
