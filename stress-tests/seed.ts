/**
 * Stress Test Data Seeder
 *
 * Creates realistic data against a running PocketBase deployment.
 * Uses additive seeding with a "stress-" prefix so records can be
 * identified and cleaned up later without wiping existing data.
 *
 * Run: npx tsx stress-tests/seed.ts
 * Clean: npx tsx stress-tests/seed.ts --clean
 */

import PocketBase from 'pocketbase';

const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://localhost:8090';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || '';

const NUM_PROJECTS = 5;
const ROLES_PER_PROJECT = 3;
const PARTICIPANTS_PER_ROLE = 5;
const MARKERS_PER_PROJECT = 200;
const REGULAR_INSTANCES_PER_PROJECT = 200;
const FIELDS_PER_REGULAR_INSTANCE = 30;
const SENSOR_INSTANCES_PER_PROJECT = 10;
const FIELDS_PER_SENSOR_INSTANCE = 500;

const PREFIX = 'stress-';

let participantCounter = 0;
const RUN_ID = Date.now().toString(36); // unique per seed run to avoid email collisions

function generateToken(): string {
	const timestamp = Date.now().toString(36);
	const randomPart = Math.random().toString(36).substring(2, 15);
	const additionalRandom = Math.random().toString(36).substring(2, 8);
	const array = new Uint8Array(4);
	crypto.getRandomValues(array);
	const cryptoRandom = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${PREFIX}${timestamp}-${randomPart}-${additionalRandom}-${cryptoRandom}`;
}

interface ProjectData {
	projectId: string;
	roleIds: string[];
	participantTokens: string[];
	participantIds: string[];
	workflowId: string;
	stageIds: string[];
	connectionIds: string[];
	categoryIds: string[];
	formId: string;
	formFieldKeys: string[];
}

async function adminClient(): Promise<PocketBase> {
	const pb = new PocketBase(PB_URL);
	pb.autoCancellation(false);
	await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
	return pb;
}

/**
 * Get or create a regular user to own stress-test projects.
 * projects.owner_id is a relation to the users collection, not superusers.
 */
async function getOrCreateOwner(pb: PocketBase): Promise<string> {
	const email = `${PREFIX}owner@test.local`;
	try {
		const existing = await pb.collection('users').getFirstListItem(`email = "${email}"`);
		return existing.id;
	} catch {
		const user = await pb.collection('users').create({
			email,
			password: 'stresstest123456',
			passwordConfirm: 'stresstest123456',
			name: 'Stress Test Owner',
			verified: true
		});
		return user.id;
	}
}

async function seedProject(pb: PocketBase, ownerId: string, index: number): Promise<ProjectData> {
	const projectName = `${PREFIX}project-${String(index + 1).padStart(2, '0')}`;
	console.log(`  Creating project: ${projectName}`);

	// Create project
	const project = await pb.collection('projects').create({
		name: projectName,
		owner_id: ownerId,
		is_active: true
	});

	// Create roles (collection is "roles", not "project_roles")
	const roleNames = ['observer', 'reporter', 'manager'];
	const roleIds: string[] = [];
	for (const roleName of roleNames) {
		const role = await pb.collection('roles').create({
			project_id: project.id,
			name: `${PREFIX}${roleName}`
		});
		roleIds.push(role.id);
	}

	// Create participants (5 per role = 15 per project)
	// participants is an auth collection: needs email, password, passwordConfirm
	// identity field is "token", role_id is a multi-relation (array)
	const participantTokens: string[] = [];
	const participantIds: string[] = [];
	for (let r = 0; r < ROLES_PER_PROJECT; r++) {
		for (let p = 0; p < PARTICIPANTS_PER_ROLE; p++) {
			participantCounter++;
			const token = generateToken();
			const participant = await pb.collection('participants').create({
				token: token,
				email: `${PREFIX}${RUN_ID}-p${participantCounter}@test.local`,
				password: token,
				passwordConfirm: token,
				project_id: project.id,
				role_id: [roleIds[r]], // multi-relation, must be array
				name: `${PREFIX}p${index}-r${r}-${p}`,
				is_active: true
			});
			participantTokens.push(token);
			participantIds.push(participant.id);
		}
	}

	// Create workflow (workflow_type is required: "incident" or "survey")
	const workflow = await pb.collection('workflows').create({
		project_id: project.id,
		name: `${PREFIX}workflow-${index + 1}`,
		workflow_type: 'incident',
		is_active: true,
		entry_allowed_roles: [] // all roles can create
	});

	// Create 4 stages: start -> review -> approve -> done
	// Fields: stage_name, stage_type, stage_order, position_x, position_y, visible_to_roles
	const stageNames = ['start', 'review', 'approve', 'done'];
	const stageTypes = ['start', 'intermediate', 'intermediate', 'end'];
	const stageIds: string[] = [];
	for (let s = 0; s < stageNames.length; s++) {
		const stage = await pb.collection('workflow_stages').create({
			workflow_id: workflow.id,
			stage_name: `${PREFIX}${stageNames[s]}`,
			stage_type: stageTypes[s],
			stage_order: s,
			position_x: s * 200,
			position_y: 100,
			visible_to_roles: [] // all roles can see
		});
		stageIds.push(stage.id);
	}

	// Create 3 connections: start->review, review->approve, approve->done
	// Fields: from_stage_id, to_stage_id, action_name, allowed_roles
	const connectionIds: string[] = [];
	for (let c = 0; c < stageNames.length - 1; c++) {
		const connection = await pb.collection('workflow_connections').create({
			workflow_id: workflow.id,
			from_stage_id: stageIds[c],
			to_stage_id: stageIds[c + 1],
			action_name: `${PREFIX}${stageNames[c]}-to-${stageNames[c + 1]}`,
			allowed_roles: [] // all roles can transition
		});
		connectionIds.push(connection.id);
	}

	// Create a form on the first connection (start->review)
	const form = await pb.collection('tools_forms').create({
		workflow_id: workflow.id,
		connection_id: connectionIds[0],
		name: `${PREFIX}entry-form`,
		allowed_roles: []
	});

	// Create form fields
	// Fields: field_label, field_type, field_order, is_required
	// field_type values: short_text, long_text, number, email, date, file, dropdown, multiple_choice, smart_dropdown, custom_table_selector
	const fieldKeys = ['title', 'description', 'priority', 'status'];
	const fieldTypes = ['short_text', 'long_text', 'dropdown', 'short_text'];
	for (let f = 0; f < fieldKeys.length; f++) {
		await pb.collection('tools_form_fields').create({
			form_id: form.id,
			field_label: fieldKeys[f],
			field_type: fieldTypes[f],
			field_order: f,
			is_required: f < 2,
			field_options: fieldTypes[f] === 'dropdown'
				? { values: ['low', 'medium', 'high'] }
				: {}
		});
	}

	// Create one automation (collection is "tools_automation", not "tools_automations")
	await pb.collection('tools_automation').create({
		workflow_id: workflow.id,
		name: `${PREFIX}auto-priority`,
		trigger_type: 'on_field_change',
		trigger_config: { field_key: 'priority' },
		is_enabled: true,
		steps: JSON.stringify([
			{
				type: 'condition',
				config: { field_key: 'priority', operator: 'equals', value: 'high' }
			},
			{
				type: 'set_field',
				config: { field_key: 'status', value: 'urgent' }
			}
		])
	});

	// Create 2 marker categories (one role-restricted)
	// Fields: name, icon_config (json), visible_to_roles
	const categoryIds: string[] = [];
	const cat1 = await pb.collection('marker_categories').create({
		project_id: project.id,
		name: `${PREFIX}general-cat`,
		icon_config: { type: 'pin', color: '#3b82f6' },
		visible_to_roles: [] // all roles
	});
	categoryIds.push(cat1.id);

	const cat2 = await pb.collection('marker_categories').create({
		project_id: project.id,
		name: `${PREFIX}restricted-cat`,
		icon_config: { type: 'alert', color: '#ef4444' },
		visible_to_roles: [roleIds[2]] // only managers
	});
	categoryIds.push(cat2.id);

	// Create markers using batch API
	// Fields: title (not "name"), location (geoPoint), created_by (-> users)
	console.log(`    Creating ${MARKERS_PER_PROJECT} markers...`);
	const generalCount = Math.floor(MARKERS_PER_PROJECT * 0.8);
	for (let start = 0; start < MARKERS_PER_PROJECT; start += 500) {
		const end = Math.min(start + 500, MARKERS_PER_PROJECT);
		const batch = pb.createBatch();
		for (let m = start; m < end; m++) {
			const catId = m < generalCount ? categoryIds[0] : categoryIds[1];
			batch.collection('markers').create({
				project_id: project.id,
				category_id: catId,
				title: `${PREFIX}marker-${m}`,
				location: {
					lat: 48.2 + Math.random() * 0.1,
					lon: 16.3 + Math.random() * 0.1
				},
				created_by: ownerId
			});
		}
		await batch.send();
	}

	// Helper: create one instance with N field values using batch API
	const BATCH_SIZE = 500; // PB_BATCH_MAX_REQUESTS=1000, leave headroom

	async function createInstance(ppb: PocketBase, participantId: string, numFields: number, prefix: string, instanceIndex: number) {
		const instance = await ppb.collection('workflow_instances').create({
			workflow_id: workflow.id,
			current_stage_id: stageIds[0],
			status: 'active',
			created_by: participantId,
			location: {
				lat: 48.2 + Math.random() * 0.1,
				lon: 16.3 + Math.random() * 0.1
			}
		});

		const toolUsage = await ppb.collection('workflow_instance_tool_usage').create({
			instance_id: instance.id,
			stage_id: stageIds[0],
			executed_by: participantId,
			executed_at: new Date().toISOString(),
			metadata: {
				action: 'instance_created',
				created_fields: Array.from({ length: numFields }, (_, f) => `${prefix}-field-${f}`)
			}
		});

		// Create field values in batches
		for (let start = 0; start < numFields; start += BATCH_SIZE) {
			const end = Math.min(start + BATCH_SIZE, numFields);
			const batch = ppb.createBatch();
			for (let f = start; f < end; f++) {
				batch.collection('workflow_instance_field_values').create({
					instance_id: instance.id,
					field_key: `${prefix}-field-${f}`,
					value: `${PREFIX}val-${instanceIndex}-${f}`,
					stage_id: stageIds[0],
					created_by_action: toolUsage.id
				});
			}
			await batch.send();
		}

		return instance.id;
	}

	// Reuse participant clients to avoid re-authing for every instance
	const participantClients: PocketBase[] = [];
	for (const token of participantTokens) {
		const ppb = new PocketBase(PB_URL);
		ppb.autoCancellation(false);
		await ppb.collection('participants').authWithPassword(token, token);
		participantClients.push(ppb);
	}

	const CONCURRENCY = 50;

	// Create regular instances (200 per project, 30 fields each)
	const totalRegular = REGULAR_INSTANCES_PER_PROJECT;
	console.log(`    Creating ${totalRegular} regular instances (${FIELDS_PER_REGULAR_INSTANCE} fields each)...`);
	for (let start = 0; start < totalRegular; start += CONCURRENCY) {
		const end = Math.min(start + CONCURRENCY, totalRegular);
		const promises = [];
		for (let i = start; i < end; i++) {
			const pIdx = i % participantIds.length;
			promises.push(createInstance(participantClients[pIdx], participantIds[pIdx], FIELDS_PER_REGULAR_INSTANCE, 'reg', i));
		}
		await Promise.all(promises);
		console.log(`      ${end}/${totalRegular} regular instances done`);
	}

	// Create sensor instances (10 per project, 500 fields each)
	const totalSensor = SENSOR_INSTANCES_PER_PROJECT;
	console.log(`    Creating ${totalSensor} sensor instances (${FIELDS_PER_SENSOR_INSTANCE} fields each)...`);
	for (let start = 0; start < totalSensor; start += CONCURRENCY) {
		const end = Math.min(start + CONCURRENCY, totalSensor);
		const promises = [];
		for (let i = start; i < end; i++) {
			const pIdx = i % participantIds.length;
			promises.push(createInstance(participantClients[pIdx], participantIds[pIdx], FIELDS_PER_SENSOR_INSTANCE, 'sensor', i));
		}
		await Promise.all(promises);
		console.log(`      ${end}/${totalSensor} sensor instances done`);
	}

	return {
		projectId: project.id,
		roleIds,
		participantTokens,
		participantIds,
		workflowId: workflow.id,
		stageIds,
		connectionIds,
		categoryIds,
		formId: form.id,
		formFieldKeys: fieldKeys
	};
}

async function seed(): Promise<void> {
	console.log(`Seeding stress test data against ${PB_URL}`);
	const pb = await adminClient();
	console.log('Authenticated as admin');

	const ownerId = await getOrCreateOwner(pb);
	console.log(`Using owner: ${ownerId}`);

	const allProjects: ProjectData[] = [];

	for (let i = 0; i < NUM_PROJECTS; i++) {
		const projectData = await seedProject(pb, ownerId, i);
		allProjects.push(projectData);
		console.log(`  Done (${i + 1}/${NUM_PROJECTS})`);
	}

	// Write manifest for k6 tests
	const manifest = {
		createdAt: new Date().toISOString(),
		pbUrl: PB_URL,
		projects: allProjects.map((p) => ({
			projectId: p.projectId,
			roleIds: p.roleIds,
			participantTokens: p.participantTokens,
			participantIds: p.participantIds,
			workflowId: p.workflowId,
			stageIds: p.stageIds,
			connectionIds: p.connectionIds,
			categoryIds: p.categoryIds,
			formId: p.formId,
			formFieldKeys: p.formFieldKeys
		}))
	};

	const fs = await import('fs');
	fs.writeFileSync(
		new URL('./manifest.json', import.meta.url),
		JSON.stringify(manifest, null, 2)
	);
	console.log(`\nManifest written to stress-tests/manifest.json`);
	const totalInstances = NUM_PROJECTS * (REGULAR_INSTANCES_PER_PROJECT + SENSOR_INSTANCES_PER_PROJECT);
	const totalFieldValues = NUM_PROJECTS * (REGULAR_INSTANCES_PER_PROJECT * FIELDS_PER_REGULAR_INSTANCE + SENSOR_INSTANCES_PER_PROJECT * FIELDS_PER_SENSOR_INSTANCE);
	console.log(`Total: ${NUM_PROJECTS} projects, ${NUM_PROJECTS * 15} participants, ${NUM_PROJECTS * MARKERS_PER_PROJECT} markers, ${totalInstances} instances, ${totalFieldValues} field values`);
}

async function clean(): Promise<void> {
	console.log(`Cleaning stress test data from ${PB_URL}`);
	const pb = await adminClient();
	console.log('Authenticated as admin');

	// Find all stress projects first
	const stressProjects = await pb.collection('projects').getFullList({
		filter: `name ~ "${PREFIX}"`,
		fields: 'id'
	});

	if (stressProjects.length === 0) {
		console.log('No stress test data found.');
		return;
	}

	const projectIds = stressProjects.map((p) => p.id);
	console.log(`Found ${projectIds.length} stress projects to clean`);

	// Delete in reverse dependency order, filtering by project
	for (const projectId of projectIds) {
		console.log(`  Cleaning project ${projectId}...`);

		// Field values -> tool usage -> instances (deepest first)
		for (const col of ['workflow_instance_field_values', 'workflow_instance_tool_usage']) {
			try {
				const records = await pb.collection(col).getFullList({
					filter: `instance_id.workflow_id.project_id = "${projectId}"`,
					fields: 'id'
				});
				for (const r of records) {
					try { await pb.collection(col).delete(r.id); } catch { /* cascade */ }
				}
				if (records.length > 0) console.log(`    Deleted ${records.length} from ${col}`);
			} catch { /* skip */ }
		}

		// Instances
		try {
			const records = await pb.collection('workflow_instances').getFullList({
				filter: `workflow_id.project_id = "${projectId}"`,
				fields: 'id'
			});
			for (const r of records) {
				try { await pb.collection('workflow_instances').delete(r.id); } catch { /* cascade */ }
			}
			if (records.length > 0) console.log(`    Deleted ${records.length} from workflow_instances`);
		} catch { /* skip */ }

		// Tools: form_fields -> forms, automation, edit
		for (const col of ['tools_form_fields']) {
			try {
				const records = await pb.collection(col).getFullList({
					filter: `form_id.workflow_id.project_id = "${projectId}"`,
					fields: 'id'
				});
				for (const r of records) {
					try { await pb.collection(col).delete(r.id); } catch { /* cascade */ }
				}
				if (records.length > 0) console.log(`    Deleted ${records.length} from ${col}`);
			} catch { /* skip */ }
		}

		for (const col of ['tools_forms', 'tools_automation', 'tools_edit']) {
			try {
				const records = await pb.collection(col).getFullList({
					filter: `workflow_id.project_id = "${projectId}"`,
					fields: 'id'
				});
				for (const r of records) {
					try { await pb.collection(col).delete(r.id); } catch { /* cascade */ }
				}
				if (records.length > 0) console.log(`    Deleted ${records.length} from ${col}`);
			} catch { /* skip */ }
		}

		// Connections, stages
		for (const col of ['workflow_connections', 'workflow_stages']) {
			try {
				const records = await pb.collection(col).getFullList({
					filter: `workflow_id.project_id = "${projectId}"`,
					fields: 'id'
				});
				for (const r of records) {
					try { await pb.collection(col).delete(r.id); } catch { /* cascade */ }
				}
				if (records.length > 0) console.log(`    Deleted ${records.length} from ${col}`);
			} catch { /* skip */ }
		}

		// Direct project children: markers, categories, participants, roles, workflows
		for (const col of ['markers', 'marker_categories', 'participants', 'roles', 'workflows']) {
			try {
				const records = await pb.collection(col).getFullList({
					filter: `project_id = "${projectId}"`,
					fields: 'id'
				});
				for (const r of records) {
					try { await pb.collection(col).delete(r.id); } catch { /* cascade */ }
				}
				if (records.length > 0) console.log(`    Deleted ${records.length} from ${col}`);
			} catch { /* skip */ }
		}

		// Delete the project itself
		try {
			await pb.collection('projects').delete(projectId);
			console.log(`    Deleted project`);
		} catch { /* skip */ }
	}

	// Clean up the stress owner user
	try {
		const owner = await pb.collection('users').getFirstListItem(`email = "${PREFIX}owner@test.local"`);
		await pb.collection('users').delete(owner.id);
		console.log('Deleted stress test owner user');
	} catch { /* skip */ }

	console.log('Cleanup complete');
}

// Run
const args = process.argv.slice(2);
if (args.includes('--clean')) {
	clean().catch(console.error);
} else {
	seed().catch(console.error);
}
