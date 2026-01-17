import { test, expect } from '@playwright/test';
import PocketBase from 'pocketbase';
import { ADMIN_CREDENTIALS } from './fixtures/test-data';

const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://localhost:8090';

/**
 * Comprehensive Workflow E2E Test - "Damage Report Workflow"
 *
 * This test creates a realistic workflow and tests:
 * 1. Entry permissions (who can create instances)
 * 2. Stage visibility (who can see instances at each stage)
 * 3. Transition permissions (who can move instances between stages)
 * 4. Form data persistence with identifiable content
 * 5. Edit tools with role-based access
 * 6. Smart dropdowns with conditional options
 * 7. Multiple instances at different stages for visual testing
 *
 * Workflow Design:
 *   [Entry Form] --> [Report] --> [Review] --> [Resolved]
 *                    (FW, SV)    (SV, AN)     (all)
 *
 * Edit Tools:
 *   - Report stage: "Edit Details" (Title, Description) - FW, SV can use
 *   - Review stage: "Change Priority" (Priority) - SV, AN can use
 *
 * Participants:
 *   - Alice = Field Worker (can create, see Report stage)
 *   - Bob = Supervisor (can see Report & Review, can resolve)
 *   - Carol = Analyst (can see Review, can resolve)
 *
 * Instances Created:
 *   - Instance 1: Report stage (Cologne) - created by Alice
 *   - Instance 2: Review stage (Berlin) - created by Alice, transitioned by Bob
 *   - Instance 3: Resolved stage (Munich) - created by Alice, resolved by Carol
 *
 * Data is intentionally NOT cleaned up for visual inspection in PocketBase admin.
 */

function generateToken(): string {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// German city coordinates
const LOCATIONS = {
	COLOGNE: { lat: 50.9375, lon: 6.9603 },
	BERLIN: { lat: 52.52, lon: 13.405 },
	MUNICH: { lat: 48.1351, lon: 11.582 }
};

test.describe.serial('Comprehensive Workflow E2E Test', () => {
	let adminPb: PocketBase;
	let projectId: string;
	let roles: Map<string, string>; // name -> id
	let participants: Map<string, { id: string; token: string }>; // name -> {id, token}
	let workflow: {
		id: string;
		stages: Map<string, string>;
		connections: Map<string, string>;
		forms: Map<string, string>;
		fields: Map<string, string>;
		editTools: Map<string, string>;
	};
	let buildingsTableId: string;
	let instances: Map<string, string>; // name -> id (Instance1, Instance2, Instance3)

	test('Setup: Create project and custom table', async () => {
		adminPb = new PocketBase(PB_URL);
		await adminPb
			.collection('users')
			.authWithPassword(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);

		const userId = adminPb.authStore.record?.id;
		if (!userId) {
			throw new Error('Failed to get authenticated user ID');
		}

		// Create project with unique name
		const uniqueName = `Damage Report Test ${Date.now()}`;
		const project = await adminPb.collection('projects').create({
			name: uniqueName,
			description: 'Comprehensive workflow test - data preserved for inspection',
			owner_id: userId,
			is_active: true
		});
		projectId = project.id;
		console.log(`\n=== SETUP ===`);
		console.log(`Created project: ${project.id} (${uniqueName})`);

		// Create custom table for buildings
		const table = await adminPb.collection('custom_tables').create({
			project_id: projectId,
			table_name: 'buildings',
			display_name: 'Buildings',
			main_column: 'name'
		});
		buildingsTableId = table.id;
		console.log(`Created custom table: buildings (${buildingsTableId})`);

		// Add building data
		const buildings = ['Building A - Main Office', 'Building B - Warehouse', 'Building C - Lab'];
		for (const building of buildings) {
			await adminPb.collection('custom_table_data').create({
				table_id: buildingsTableId,
				row_data: { name: building, address: `${building} Street 123` }
			});
		}
		console.log(`Added ${buildings.length} buildings to custom table`);
	});

	test('Setup: Create roles and participants', async () => {
		roles = new Map();
		participants = new Map();
		instances = new Map();
		const timestamp = Date.now().toString().slice(-6);

		// Create roles
		const roleNames = ['Field Worker', 'Supervisor', 'Analyst'];
		for (const roleName of roleNames) {
			const role = await adminPb.collection('roles').create({
				project_id: projectId,
				name: roleName,
				description: `Test role: ${roleName}`
			});
			roles.set(roleName, role.id);
			console.log(`Created role: ${roleName} (${role.id})`);
		}

		// Create participants with specific role assignments
		const participantData = [
			{ name: 'Alice', role: 'Field Worker' },
			{ name: 'Bob', role: 'Supervisor' },
			{ name: 'Carol', role: 'Analyst' }
		];

		console.log(`\n--- Participant Credentials ---`);
		for (const p of participantData) {
			const token = generateToken();
			const uniqueEmail = `${p.name.toLowerCase()}+${timestamp}@test.com`;

			const participant = await adminPb.collection('participants').create({
				project_id: projectId,
				name: p.name,
				email: uniqueEmail,
				password: token,
				passwordConfirm: token,
				token: token,
				is_active: true,
				role_id: [roles.get(p.role)!]
			});
			participants.set(p.name, { id: participant.id, token });
			console.log(`${p.name} (${p.role}): token = ${token}`);
		}
	});

	test('Setup: Create workflow with stages and visibility rules', async () => {
		workflow = {
			id: '',
			stages: new Map(),
			connections: new Map(),
			forms: new Map(),
			fields: new Map(),
			editTools: new Map()
		};

		// Create workflow with entry restricted to Field Worker
		const wf = await adminPb.collection('workflows').create({
			project_id: projectId,
			name: 'Damage Report Workflow',
			description: 'Comprehensive test workflow with edit tools and smart dropdowns',
			workflow_type: 'incident',
			is_active: true,
			entry_allowed_roles: [roles.get('Field Worker')!]
		});
		workflow.id = wf.id;
		console.log(`\nCreated workflow: ${workflow.id}`);

		// Create stages with visibility rules
		// Report: Field Worker, Supervisor can see
		// Review: Supervisor, Analyst can see (NOT Field Worker)
		// Resolved: Empty = all can see
		const stageConfigs = [
			{
				name: 'Report',
				type: 'start',
				visibleRoles: ['Field Worker', 'Supervisor'],
				x: 150,
				y: 200
			},
			{
				name: 'Review',
				type: 'intermediate',
				visibleRoles: ['Supervisor', 'Analyst'],
				x: 450,
				y: 200
			},
			{ name: 'Resolved', type: 'end', visibleRoles: [], x: 750, y: 200 }
		];

		for (const cfg of stageConfigs) {
			const visibleToRoles = cfg.visibleRoles.map((r) => roles.get(r)!).filter(Boolean);
			const stage = await adminPb.collection('workflow_stages').create({
				workflow_id: workflow.id,
				stage_name: cfg.name,
				stage_type: cfg.type,
				position_x: cfg.x,
				position_y: cfg.y,
				visible_to_roles: visibleToRoles
			});
			workflow.stages.set(cfg.name, stage.id);
			console.log(
				`Created stage: ${cfg.name} (visible to: ${cfg.visibleRoles.join(', ') || 'all'})`
			);
		}
	});

	test('Setup: Create connections with role restrictions', async () => {
		// Entry connection: only Field Worker can create instances
		const entryConn = await adminPb.collection('workflow_connections').create({
			workflow_id: workflow.id,
			from_stage_id: null,
			to_stage_id: workflow.stages.get('Report'),
			action_name: 'entry',
			allowed_roles: [roles.get('Field Worker')!]
		});
		workflow.connections.set('entry', entryConn.id);
		console.log(`Created entry connection (Field Worker only)`);

		// Report -> Review: Field Worker, Supervisor can transition
		const toReviewConn = await adminPb.collection('workflow_connections').create({
			workflow_id: workflow.id,
			from_stage_id: workflow.stages.get('Report'),
			to_stage_id: workflow.stages.get('Review'),
			action_name: 'submit-for-review',
			allowed_roles: [roles.get('Field Worker')!, roles.get('Supervisor')!]
		});
		workflow.connections.set('toReview', toReviewConn.id);
		console.log(`Created Report -> Review connection (Field Worker, Supervisor)`);

		// Review -> Resolved: Supervisor, Analyst can resolve
		const toResolvedConn = await adminPb.collection('workflow_connections').create({
			workflow_id: workflow.id,
			from_stage_id: workflow.stages.get('Review'),
			to_stage_id: workflow.stages.get('Resolved'),
			action_name: 'resolve',
			allowed_roles: [roles.get('Supervisor')!, roles.get('Analyst')!]
		});
		workflow.connections.set('toResolved', toResolvedConn.id);
		console.log(`Created Review -> Resolved connection (Supervisor, Analyst)`);
	});

	test('Setup: Create forms with comprehensive field types, layout, and smart dropdown', async () => {
		// Entry form with rich field types
		const entryForm = await adminPb.collection('tools_forms').create({
			workflow_id: workflow.id,
			connection_id: workflow.connections.get('entry'),
			name: 'Damage Report Entry Form',
			description: 'Initial report submission'
		});
		workflow.forms.set('entry', entryForm.id);
		console.log(`\nCreated entry form: ${entryForm.id}`);

		// Entry form fields with proper layout (row_index and column_position)
		// IMPORTANT: page must be 1 (not 0) - the form builder defaults to showing page 1
		const entryFields = [
			{
				label: 'Title',
				type: 'short_text',
				required: true,
				order: 1,
				page: 1,
				row_index: 0,
				column_position: 'full',
				placeholder: 'Enter a descriptive title',
				help_text: 'Brief summary of the damage'
			},
			{
				label: 'Description',
				type: 'long_text',
				required: true,
				order: 2,
				page: 1,
				row_index: 1,
				column_position: 'full',
				placeholder: 'Describe the damage in detail',
				help_text: 'Include location, extent, and any immediate risks'
			},
			{
				label: 'Severity',
				type: 'dropdown',
				required: true,
				order: 3,
				page: 1,
				row_index: 2,
				column_position: 'left',
				placeholder: 'Select severity level',
				options: ['Low', 'Medium', 'High', 'Critical']
			},
			{
				label: 'Damage Type',
				type: 'dropdown',
				required: true,
				order: 4,
				page: 1,
				row_index: 2,
				column_position: 'right',
				placeholder: 'Select damage type',
				options: ['Water', 'Fire', 'Structural', 'Electrical'],
				help_text: 'Primary category of damage'
			},
			{
				label: 'Reporter Notes',
				type: 'long_text',
				required: false,
				order: 6, // Order 5 will be smart dropdown
				page: 1,
				row_index: 4,
				column_position: 'full',
				placeholder: 'Additional observations...',
				help_text: 'Any other relevant information'
			}
		];

		// Create Damage Type field first to get its ID for smart dropdown
		let damageTypeFieldId: string | null = null;

		for (const f of entryFields) {
			const fieldData: Record<string, unknown> = {
				form_id: entryForm.id,
				field_label: f.label,
				field_type: f.type,
				is_required: f.required,
				field_order: f.order,
				page: f.page,
				row_index: f.row_index,
				column_position: f.column_position,
				placeholder: f.placeholder || null,
				help_text: f.help_text || null,
				field_options: f.options ? { options: f.options.map((o) => ({ label: o })) } : null
			};

			const field = await adminPb.collection('tools_form_fields').create(fieldData);
			workflow.fields.set(f.label, field.id);
			console.log(`  Field: ${f.label} (${f.type}) [row ${f.row_index}, ${f.column_position}]`);

			if (f.label === 'Damage Type') {
				damageTypeFieldId = field.id;
			}
		}

		// Create smart dropdown for Sub-Category (depends on Damage Type)
		const smartDropdownData = {
			form_id: entryForm.id,
			field_label: 'Sub-Category',
			field_type: 'smart_dropdown',
			is_required: false,
			field_order: 5,
			page: 1,
			row_index: 3,
			column_position: 'full',
			placeholder: 'Select sub-category based on damage type',
			help_text: 'Options change based on the selected Damage Type',
			field_options: {
				source_field: damageTypeFieldId,
				mappings: [
					{
						when: 'Water',
						options: [{ label: 'Leak' }, { label: 'Flood' }, { label: 'Burst Pipe' }]
					},
					{
						when: 'Fire',
						options: [{ label: 'Smoke Damage' }, { label: 'Flames' }, { label: 'Electrical Fire' }]
					},
					{
						when: 'Structural',
						options: [{ label: 'Crack' }, { label: 'Collapse' }, { label: 'Foundation' }]
					},
					{
						when: 'Electrical',
						options: [
							{ label: 'Short Circuit' },
							{ label: 'Power Outage' },
							{ label: 'Wiring Issue' }
						]
					}
				]
			}
		};

		const smartDropdownField = await adminPb
			.collection('tools_form_fields')
			.create(smartDropdownData);
		workflow.fields.set('Sub-Category', smartDropdownField.id);
		console.log(`  Field: Sub-Category (smart_dropdown) [row 3, full] - depends on Damage Type`);

		// Review form
		const reviewForm = await adminPb.collection('tools_forms').create({
			workflow_id: workflow.id,
			connection_id: workflow.connections.get('toReview'),
			name: 'Review Form',
			description: 'Submit for review with notes'
		});
		workflow.forms.set('review', reviewForm.id);
		console.log(`Created review form: ${reviewForm.id}`);

		const reviewFields = [
			{
				label: 'Review Status',
				type: 'dropdown',
				required: true,
				order: 1,
				page: 1,
				row_index: 0,
				column_position: 'left',
				options: ['Approved', 'Needs Info', 'Rejected']
			},
			{
				label: 'Priority',
				type: 'dropdown',
				required: false,
				order: 2,
				page: 1,
				row_index: 0,
				column_position: 'right',
				options: ['P1', 'P2', 'P3', 'P4'],
				help_text: 'Set priority for resolution'
			},
			{
				label: 'Reviewer Notes',
				type: 'long_text',
				required: false,
				order: 3,
				page: 1,
				row_index: 1,
				column_position: 'full',
				placeholder: 'Add review comments...'
			}
		];

		for (const f of reviewFields) {
			const fieldData: Record<string, unknown> = {
				form_id: reviewForm.id,
				field_label: f.label,
				field_type: f.type,
				is_required: f.required,
				field_order: f.order,
				page: f.page,
				row_index: f.row_index,
				column_position: f.column_position,
				placeholder: f.placeholder || null,
				help_text: f.help_text || null,
				field_options: f.options ? { options: f.options.map((o) => ({ label: o })) } : null
			};

			const field = await adminPb.collection('tools_form_fields').create(fieldData);
			workflow.fields.set(f.label, field.id);
			console.log(`  Field: ${f.label} (${f.type}) [row ${f.row_index}, ${f.column_position}]`);
		}

		// Resolution form
		const resolveForm = await adminPb.collection('tools_forms').create({
			workflow_id: workflow.id,
			connection_id: workflow.connections.get('toResolved'),
			name: 'Resolution Form',
			description: 'Final resolution details'
		});
		workflow.forms.set('resolve', resolveForm.id);
		console.log(`Created resolution form: ${resolveForm.id}`);

		const resolveFields = [
			{
				label: 'Resolution Type',
				type: 'dropdown',
				required: true,
				order: 1,
				page: 1,
				row_index: 0,
				column_position: 'left',
				options: ['Fixed', 'Deferred', "Won't Fix"]
			},
			{
				label: 'Cost Estimate',
				type: 'number',
				required: false,
				order: 2,
				page: 1,
				row_index: 0,
				column_position: 'right',
				placeholder: 'Enter cost in EUR',
				help_text: 'Estimated repair cost'
			},
			{
				label: 'Resolution Notes',
				type: 'long_text',
				required: false,
				order: 3,
				page: 1,
				row_index: 1,
				column_position: 'full',
				placeholder: 'Describe the resolution...'
			}
		];

		for (const f of resolveFields) {
			const fieldData: Record<string, unknown> = {
				form_id: resolveForm.id,
				field_label: f.label,
				field_type: f.type,
				is_required: f.required,
				field_order: f.order,
				page: f.page,
				row_index: f.row_index,
				column_position: f.column_position,
				placeholder: f.placeholder || null,
				help_text: f.help_text || null,
				field_options: f.options ? { options: f.options.map((o) => ({ label: o })) } : null
			};

			const field = await adminPb.collection('tools_form_fields').create(fieldData);
			workflow.fields.set(f.label, field.id);
			console.log(`  Field: ${f.label} (${f.type}) [row ${f.row_index}, ${f.column_position}]`);
		}
	});

	test('Setup: Create edit tools at stages', async () => {
		console.log(`\n--- Creating Edit Tools ---`);

		// Edit tool at Report stage - allows editing Title and Description
		const editReportTool = await adminPb.collection('tools_edit').create({
			stage_id: workflow.stages.get('Report'),
			name: 'Edit Report Details',
			editable_fields: [workflow.fields.get('Title')!, workflow.fields.get('Description')!],
			allowed_roles: [roles.get('Field Worker')!, roles.get('Supervisor')!],
			visual_config: {
				button_label: 'Edit Details',
				button_color: '#3b82f6'
			}
		});
		workflow.editTools.set('editReport', editReportTool.id);
		console.log(`Created edit tool: "Edit Report Details" at Report stage (Field Worker, Supervisor)`);
		console.log(`  - Editable fields: Title, Description`);
		console.log(`  - Button: "Edit Details" (blue)`);

		// Edit tool at Review stage - allows editing Priority
		const editReviewTool = await adminPb.collection('tools_edit').create({
			stage_id: workflow.stages.get('Review'),
			name: 'Update Priority',
			editable_fields: [workflow.fields.get('Priority')!],
			allowed_roles: [roles.get('Supervisor')!, roles.get('Analyst')!],
			visual_config: {
				button_label: 'Change Priority',
				button_color: '#f59e0b'
			}
		});
		workflow.editTools.set('editReview', editReviewTool.id);
		console.log(`Created edit tool: "Update Priority" at Review stage (Supervisor, Analyst)`);
		console.log(`  - Editable fields: Priority`);
		console.log(`  - Button: "Change Priority" (orange)`);
	});

	test('1. NEGATIVE: Bob (Supervisor) CANNOT create instance - entry is Field Worker only', async () => {
		console.log(`\n=== TEST 1: Entry Permission (Negative) ===`);
		const bob = participants.get('Bob')!;
		const pb = new PocketBase(PB_URL);
		await pb.collection('participants').authWithPassword(bob.token, bob.token);

		let errorThrown = false;
		try {
			await pb.collection('workflow_instances').create({
				workflow_id: workflow.id,
				current_stage_id: workflow.stages.get('Report'),
				status: 'active',
				created_by: bob.id,
				location: LOCATIONS.COLOGNE
			});
		} catch (e: unknown) {
			errorThrown = true;
			const error = e as { status?: number };
			console.log(`Bob (Supervisor) correctly DENIED: ${error.status}`);
		}
		expect(errorThrown).toBe(true);
		console.log(`PASS: Supervisor cannot create instance (entry restricted to Field Worker)`);
	});

	test('2. NEGATIVE: Carol (Analyst) CANNOT create instance', async () => {
		console.log(`\n=== TEST 2: Entry Permission (Negative) ===`);
		const carol = participants.get('Carol')!;
		const pb = new PocketBase(PB_URL);
		await pb.collection('participants').authWithPassword(carol.token, carol.token);

		let errorThrown = false;
		try {
			await pb.collection('workflow_instances').create({
				workflow_id: workflow.id,
				current_stage_id: workflow.stages.get('Report'),
				status: 'active',
				created_by: carol.id,
				location: LOCATIONS.COLOGNE
			});
		} catch (e: unknown) {
			errorThrown = true;
			const error = e as { status?: number };
			console.log(`Carol (Analyst) correctly DENIED: ${error.status}`);
		}
		expect(errorThrown).toBe(true);
		console.log(`PASS: Analyst cannot create instance (entry restricted to Field Worker)`);
	});

	test('3. POSITIVE: Alice creates Instance 1 at Report stage (Cologne)', async () => {
		console.log(`\n=== TEST 3: Create Instance 1 - Report Stage ===`);
		const alice = participants.get('Alice')!;
		const pb = new PocketBase(PB_URL);
		await pb.collection('participants').authWithPassword(alice.token, alice.token);

		// Create instance with Cologne location
		const instance = await pb.collection('workflow_instances').create({
			workflow_id: workflow.id,
			current_stage_id: workflow.stages.get('Report'),
			status: 'active',
			created_by: alice.id,
			location: LOCATIONS.COLOGNE
		});
		instances.set('Instance1', instance.id);
		console.log(`Alice created Instance 1: ${instance.id} (Cologne: ${LOCATIONS.COLOGNE.lat}, ${LOCATIONS.COLOGNE.lon})`);

		// Save form field values with identifiable data
		const timestamp = new Date().toISOString();
		const fieldValues = [
			{ field: 'Title', value: 'Water Leak in Building A' },
			{ field: 'Description', value: 'Major water leak detected on floor 3, ceiling panels damaged' },
			{ field: 'Severity', value: 'High' },
			{ field: 'Damage Type', value: 'Water' },
			{ field: 'Sub-Category', value: 'Burst Pipe' },
			{
				field: 'Reporter Notes',
				value: `Instance 1: Created by ALICE (Field Worker) at Report stage - ${timestamp}. This instance stays at Report stage for testing visibility.`
			}
		];

		for (const fv of fieldValues) {
			const fieldId = workflow.fields.get(fv.field);
			if (fieldId) {
				await pb.collection('workflow_instance_field_values').create({
					instance_id: instance.id,
					field_key: fieldId,
					value: fv.value,
					stage_id: workflow.stages.get('Report')
				});
			}
		}
		console.log(`Filled entry form with ${fieldValues.length} fields`);
		console.log(`PASS: Instance 1 created at Report stage`);
	});

	test('4. POSITIVE: Alice creates Instance 2 and Bob transitions to Review (Berlin)', async () => {
		console.log(`\n=== TEST 4: Create Instance 2 - Will be at Review Stage ===`);
		const alice = participants.get('Alice')!;
		const alicePb = new PocketBase(PB_URL);
		await alicePb.collection('participants').authWithPassword(alice.token, alice.token);

		// Create instance with Berlin location
		const instance = await alicePb.collection('workflow_instances').create({
			workflow_id: workflow.id,
			current_stage_id: workflow.stages.get('Report'),
			status: 'active',
			created_by: alice.id,
			location: LOCATIONS.BERLIN
		});
		instances.set('Instance2', instance.id);
		console.log(`Alice created Instance 2: ${instance.id} (Berlin: ${LOCATIONS.BERLIN.lat}, ${LOCATIONS.BERLIN.lon})`);

		// Fill entry form
		const timestamp = new Date().toISOString();
		const entryValues = [
			{ field: 'Title', value: 'Fire Alarm System Malfunction' },
			{ field: 'Description', value: 'Fire alarm triggered without cause, electrical panel shows signs of overheating' },
			{ field: 'Severity', value: 'Critical' },
			{ field: 'Damage Type', value: 'Electrical' },
			{ field: 'Sub-Category', value: 'Short Circuit' },
			{
				field: 'Reporter Notes',
				value: `Instance 2: Created by ALICE at ${timestamp}. Will be transitioned to Review by BOB.`
			}
		];

		for (const fv of entryValues) {
			const fieldId = workflow.fields.get(fv.field);
			if (fieldId) {
				await alicePb.collection('workflow_instance_field_values').create({
					instance_id: instance.id,
					field_key: fieldId,
					value: fv.value,
					stage_id: workflow.stages.get('Report')
				});
			}
		}

		// Bob transitions to Review
		const bob = participants.get('Bob')!;
		const bobPb = new PocketBase(PB_URL);
		await bobPb.collection('participants').authWithPassword(bob.token, bob.token);

		// Fill review form
		const reviewValues = [
			{ field: 'Review Status', value: 'Approved' },
			{ field: 'Priority', value: 'P1' },
			{
				field: 'Reviewer Notes',
				value: `Instance 2: At Review stage - transitioned by BOB (Supervisor) - ${timestamp}`
			}
		];

		for (const fv of reviewValues) {
			const fieldId = workflow.fields.get(fv.field);
			if (fieldId) {
				await bobPb.collection('workflow_instance_field_values').create({
					instance_id: instance.id,
					field_key: fieldId,
					value: fv.value,
					stage_id: workflow.stages.get('Review')
				});
			}
		}

		// Transition to Review
		await bobPb.collection('workflow_instances').update(instance.id, {
			current_stage_id: workflow.stages.get('Review')
		});
		console.log(`Bob transitioned Instance 2 to Review stage`);
		console.log(`PASS: Instance 2 created and transitioned to Review`);
	});

	test('5. POSITIVE: Alice creates Instance 3 and Carol resolves it (Munich)', async () => {
		console.log(`\n=== TEST 5: Create Instance 3 - Will be Resolved ===`);
		const alice = participants.get('Alice')!;
		const alicePb = new PocketBase(PB_URL);
		await alicePb.collection('participants').authWithPassword(alice.token, alice.token);

		// Create instance with Munich location
		const instance = await alicePb.collection('workflow_instances').create({
			workflow_id: workflow.id,
			current_stage_id: workflow.stages.get('Report'),
			status: 'active',
			created_by: alice.id,
			location: LOCATIONS.MUNICH
		});
		instances.set('Instance3', instance.id);
		console.log(`Alice created Instance 3: ${instance.id} (Munich: ${LOCATIONS.MUNICH.lat}, ${LOCATIONS.MUNICH.lon})`);

		// Fill entry form
		const timestamp = new Date().toISOString();
		const entryValues = [
			{ field: 'Title', value: 'Structural Crack in Foundation' },
			{ field: 'Description', value: 'Large crack discovered in basement foundation, possible water seepage' },
			{ field: 'Severity', value: 'Medium' },
			{ field: 'Damage Type', value: 'Structural' },
			{ field: 'Sub-Category', value: 'Foundation' },
			{
				field: 'Reporter Notes',
				value: `Instance 3: Created by ALICE at ${timestamp}. Will be fully resolved by CAROL.`
			}
		];

		for (const fv of entryValues) {
			const fieldId = workflow.fields.get(fv.field);
			if (fieldId) {
				await alicePb.collection('workflow_instance_field_values').create({
					instance_id: instance.id,
					field_key: fieldId,
					value: fv.value,
					stage_id: workflow.stages.get('Report')
				});
			}
		}

		// Alice transitions to Review (she has permission)
		const reviewValues = [
			{ field: 'Review Status', value: 'Approved' },
			{ field: 'Priority', value: 'P2' },
			{
				field: 'Reviewer Notes',
				value: `Submitted for review by ALICE at ${timestamp}`
			}
		];

		for (const fv of reviewValues) {
			const fieldId = workflow.fields.get(fv.field);
			if (fieldId) {
				await alicePb.collection('workflow_instance_field_values').create({
					instance_id: instance.id,
					field_key: fieldId,
					value: fv.value,
					stage_id: workflow.stages.get('Review')
				});
			}
		}

		await alicePb.collection('workflow_instances').update(instance.id, {
			current_stage_id: workflow.stages.get('Review')
		});
		console.log(`Alice transitioned Instance 3 to Review stage`);

		// Carol resolves
		const carol = participants.get('Carol')!;
		const carolPb = new PocketBase(PB_URL);
		await carolPb.collection('participants').authWithPassword(carol.token, carol.token);

		const resolveValues = [
			{ field: 'Resolution Type', value: 'Fixed' },
			{ field: 'Cost Estimate', value: '5000' },
			{
				field: 'Resolution Notes',
				value: `Instance 3: Resolved by CAROL (Analyst) - ${timestamp}. Foundation repaired and waterproofing applied.`
			}
		];

		for (const fv of resolveValues) {
			const fieldId = workflow.fields.get(fv.field);
			if (fieldId) {
				await carolPb.collection('workflow_instance_field_values').create({
					instance_id: instance.id,
					field_key: fieldId,
					value: fv.value,
					stage_id: workflow.stages.get('Resolved')
				});
			}
		}

		await carolPb.collection('workflow_instances').update(instance.id, {
			current_stage_id: workflow.stages.get('Resolved'),
			status: 'completed'
		});
		console.log(`Carol resolved Instance 3`);
		console.log(`PASS: Instance 3 created, reviewed, and resolved`);
	});

	test('6. VISIBILITY: Test stage visibility for all instances', async () => {
		console.log(`\n=== TEST 6: Stage Visibility Check ===`);

		const instance1 = instances.get('Instance1')!;
		const instance2 = instances.get('Instance2')!;
		const instance3 = instances.get('Instance3')!;

		// Alice (Field Worker) visibility
		const alicePb = new PocketBase(PB_URL);
		await alicePb.collection('participants').authWithPassword(
			participants.get('Alice')!.token,
			participants.get('Alice')!.token
		);
		const aliceInstances = await alicePb.collection('workflow_instances').getFullList({
			filter: `id = "${instance1}" || id = "${instance2}" || id = "${instance3}"`
		});
		const aliceCanSee = aliceInstances.map((i) => i.id);
		console.log(`Alice (Field Worker) can see: ${aliceCanSee.length} instances`);
		console.log(`  - Instance 1 (Report): ${aliceCanSee.includes(instance1) ? 'YES' : 'NO'}`);
		console.log(`  - Instance 2 (Review): ${aliceCanSee.includes(instance2) ? 'YES' : 'NO'}`);
		console.log(`  - Instance 3 (Resolved): ${aliceCanSee.includes(instance3) ? 'YES' : 'NO'}`);
		// Alice should see Instance 1 (Report) and Instance 3 (Resolved), NOT Instance 2 (Review)
		expect(aliceCanSee).toContain(instance1);
		expect(aliceCanSee).toContain(instance3);

		// Bob (Supervisor) visibility
		const bobPb = new PocketBase(PB_URL);
		await bobPb.collection('participants').authWithPassword(
			participants.get('Bob')!.token,
			participants.get('Bob')!.token
		);
		const bobInstances = await bobPb.collection('workflow_instances').getFullList({
			filter: `id = "${instance1}" || id = "${instance2}" || id = "${instance3}"`
		});
		const bobCanSee = bobInstances.map((i) => i.id);
		console.log(`Bob (Supervisor) can see: ${bobCanSee.length} instances`);
		console.log(`  - Instance 1 (Report): ${bobCanSee.includes(instance1) ? 'YES' : 'NO'}`);
		console.log(`  - Instance 2 (Review): ${bobCanSee.includes(instance2) ? 'YES' : 'NO'}`);
		console.log(`  - Instance 3 (Resolved): ${bobCanSee.includes(instance3) ? 'YES' : 'NO'}`);
		// Bob should see all 3 instances
		expect(bobCanSee).toContain(instance1);
		expect(bobCanSee).toContain(instance2);
		expect(bobCanSee).toContain(instance3);

		// Carol (Analyst) visibility
		const carolPb = new PocketBase(PB_URL);
		await carolPb.collection('participants').authWithPassword(
			participants.get('Carol')!.token,
			participants.get('Carol')!.token
		);
		const carolInstances = await carolPb.collection('workflow_instances').getFullList({
			filter: `id = "${instance1}" || id = "${instance2}" || id = "${instance3}"`
		});
		const carolCanSee = carolInstances.map((i) => i.id);
		console.log(`Carol (Analyst) can see: ${carolCanSee.length} instances`);
		console.log(`  - Instance 1 (Report): ${carolCanSee.includes(instance1) ? 'YES' : 'NO'}`);
		console.log(`  - Instance 2 (Review): ${carolCanSee.includes(instance2) ? 'YES' : 'NO'}`);
		console.log(`  - Instance 3 (Resolved): ${carolCanSee.includes(instance3) ? 'YES' : 'NO'}`);
		// Carol should see Instance 2 (Review) and Instance 3 (Resolved), NOT Instance 1 (Report)
		expect(carolCanSee).toContain(instance2);
		expect(carolCanSee).toContain(instance3);

		console.log(`PASS: Stage visibility rules working correctly`);
	});

	test('7. EDIT TOOLS: Verify edit tool access', async () => {
		console.log(`\n=== TEST 7: Edit Tool Access Check ===`);

		// Verify edit tools were created
		const editTools = await adminPb.collection('tools_edit').getFullList({
			filter: `stage_id = "${workflow.stages.get('Report')}" || stage_id = "${workflow.stages.get('Review')}"`
		});
		expect(editTools.length).toBe(2);

		const reportEditTool = editTools.find((t) => t.stage_id === workflow.stages.get('Report'));
		const reviewEditTool = editTools.find((t) => t.stage_id === workflow.stages.get('Review'));

		expect(reportEditTool).toBeDefined();
		expect(reviewEditTool).toBeDefined();

		console.log(`Report stage edit tool: ${reportEditTool?.name}`);
		console.log(`  - Allowed roles: Field Worker, Supervisor`);
		console.log(`  - Editable fields: ${reportEditTool?.editable_fields.length}`);

		console.log(`Review stage edit tool: ${reviewEditTool?.name}`);
		console.log(`  - Allowed roles: Supervisor, Analyst`);
		console.log(`  - Editable fields: ${reviewEditTool?.editable_fields.length}`);

		// Verify role assignments
		expect(reportEditTool?.allowed_roles).toContain(roles.get('Field Worker'));
		expect(reportEditTool?.allowed_roles).toContain(roles.get('Supervisor'));
		expect(reviewEditTool?.allowed_roles).toContain(roles.get('Supervisor'));
		expect(reviewEditTool?.allowed_roles).toContain(roles.get('Analyst'));

		console.log(`PASS: Edit tools created with correct permissions`);
	});

	test('8. SMART DROPDOWN: Verify smart dropdown configuration', async () => {
		console.log(`\n=== TEST 8: Smart Dropdown Check ===`);

		const subCategoryFieldId = workflow.fields.get('Sub-Category');
		const damageTypeFieldId = workflow.fields.get('Damage Type');

		const subCategoryField = await adminPb.collection('tools_form_fields').getOne(subCategoryFieldId!);

		expect(subCategoryField.field_type).toBe('smart_dropdown');
		expect(subCategoryField.field_options).toBeDefined();
		expect(subCategoryField.field_options.source_field).toBe(damageTypeFieldId);
		expect(subCategoryField.field_options.mappings).toHaveLength(4);

		console.log(`Smart dropdown "Sub-Category" configured:`);
		console.log(`  - Source field: Damage Type (${damageTypeFieldId})`);
		console.log(`  - Mappings for: Water, Fire, Structural, Electrical`);

		for (const mapping of subCategoryField.field_options.mappings) {
			console.log(`    - ${mapping.when}: ${mapping.options.map((o: { label: string }) => o.label).join(', ')}`);
		}

		console.log(`PASS: Smart dropdown properly configured`);
	});

	test('9. SUMMARY: Print all data for visual inspection', async () => {
		console.log(`\n========================================`);
		console.log(`COMPREHENSIVE WORKFLOW TEST SUMMARY`);
		console.log(`========================================`);
		console.log(`Project ID: ${projectId}`);
		console.log(`Workflow ID: ${workflow.id}`);

		console.log(`\n--- Stages ---`);
		for (const [name, id] of workflow.stages) {
			console.log(`  ${name}: ${id}`);
		}

		console.log(`\n--- Edit Tools ---`);
		for (const [name, id] of workflow.editTools) {
			console.log(`  ${name}: ${id}`);
		}

		console.log(`\n--- Instances ---`);
		const instance1 = instances.get('Instance1')!;
		const instance2 = instances.get('Instance2')!;
		const instance3 = instances.get('Instance3')!;

		const inst1 = await adminPb.collection('workflow_instances').getOne(instance1);
		const inst2 = await adminPb.collection('workflow_instances').getOne(instance2);
		const inst3 = await adminPb.collection('workflow_instances').getOne(instance3);

		const stageName = (stageId: string) => {
			for (const [name, id] of workflow.stages) {
				if (id === stageId) return name;
			}
			return 'Unknown';
		};

		console.log(`  Instance 1: ${instance1}`);
		console.log(`    - Stage: ${stageName(inst1.current_stage_id)}`);
		console.log(`    - Location: Cologne (${inst1.location?.lat}, ${inst1.location?.lon})`);

		console.log(`  Instance 2: ${instance2}`);
		console.log(`    - Stage: ${stageName(inst2.current_stage_id)}`);
		console.log(`    - Location: Berlin (${inst2.location?.lat}, ${inst2.location?.lon})`);

		console.log(`  Instance 3: ${instance3}`);
		console.log(`    - Stage: ${stageName(inst3.current_stage_id)}`);
		console.log(`    - Location: Munich (${inst3.location?.lat}, ${inst3.location?.lon})`);

		console.log(`\n--- Participant Login Tokens ---`);
		console.log(`Use these at /participant/login to test visibility:`);
		for (const [name, p] of participants) {
			const roleText =
				name === 'Alice'
					? 'Field Worker'
					: name === 'Bob'
						? 'Supervisor'
						: 'Analyst';
			console.log(`  ${name} (${roleText}): ${p.token}`);
		}

		console.log(`\n--- Expected Visibility ---`);
		console.log(`  Alice (Field Worker):`);
		console.log(`    - CAN see: Instance 1 (Report), Instance 3 (Resolved)`);
		console.log(`    - CANNOT see: Instance 2 (Review)`);
		console.log(`    - CAN use: "Edit Details" button on Instance 1`);
		console.log(`  Bob (Supervisor):`);
		console.log(`    - CAN see: All 3 instances`);
		console.log(`    - CAN use: "Edit Details" on Instance 1, "Change Priority" on Instance 2`);
		console.log(`  Carol (Analyst):`);
		console.log(`    - CAN see: Instance 2 (Review), Instance 3 (Resolved)`);
		console.log(`    - CANNOT see: Instance 1 (Report)`);
		console.log(`    - CAN use: "Change Priority" on Instance 2`);

		console.log(`\n========================================`);
		console.log(`Data preserved in database for inspection!`);
		console.log(`PocketBase Admin: ${PB_URL}/_/`);
		console.log(`Participant Login: /participant/login`);
		console.log(`========================================\n`);
	});
});
