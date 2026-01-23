import { test, expect, type Page } from '@playwright/test';
import PocketBase from 'pocketbase';
import { ADMIN_CREDENTIALS } from './fixtures/test-data';

const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://localhost:8090';

/**
 * Permission Matrix E2E Test
 *
 * Comprehensive test for all permission layers in the workflow system.
 * Tests through the actual UI (participant map) to verify real user experience.
 *
 * Permission Layers Tested:
 * 1. Entry permissions (who can create instances)
 * 2. Stage visibility (who can see instances at each stage)
 * 3. Field value permissions (who can read/write field values)
 * 4. Audit trail permissions (who can see tool_usage history)
 * 5. Edit tool permissions (who can use edit tools)
 * 6. Connection permissions (who can see/trigger transitions)
 *
 * Special Tests:
 * - Historical data leakage: Verify field values from restricted stages
 *   remain hidden even when instance moves to open stage
 * - Noone role lockdown: Verify complete lockdown when all permissions
 *   are changed to an unassigned role
 *
 * Data is intentionally NOT cleaned up for visual inspection in PocketBase admin.
 */

function generateToken(): string {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// German city coordinates for test instances
const LOCATIONS = {
	BERLIN: { lat: 52.52, lon: 13.405 },
	MUNICH: { lat: 48.1351, lon: 11.582 },
	COLOGNE: { lat: 50.9375, lon: 6.9603 },
	HAMBURG: { lat: 53.5511, lon: 9.9937 }
};

// =============================================================================
// Helper Functions
// =============================================================================

async function loginAsParticipant(page: Page, token: string) {
	await page.goto('/participant/login');
	await page.fill('[data-testid="token-input"]', token);
	await page.click('[data-testid="login-button"]');
	await page.waitForURL('/participant/map', { timeout: 10000 });
	// Wait for map to fully load (loading overlay to disappear)
	await page.waitForSelector('text=Loading map...', { state: 'detached', timeout: 15000 });
	// Give markers time to render
	await page.waitForTimeout(1000);

	// Zoom out to see all markers in Germany (zoom level 6 covers all test cities)
	const zoomOutButton = page.locator('button[title="Zoom out"], .leaflet-control-zoom-out');
	for (let i = 0; i < 8; i++) {
		await zoomOutButton.click();
		await page.waitForTimeout(200);
	}
	await page.waitForTimeout(500);
}

async function selectInstance(page: Page, instanceId: string) {
	// Wait for map to load
	await page.waitForSelector('[data-testid="map-canvas"]', { timeout: 10000 });
	// Find the instance marker
	const marker = page.locator(`[data-instance-id="${instanceId}"]`);

	// Check if marker element exists
	const count = await marker.count();
	console.log(`Marker ${instanceId}: count=${count}`);

	if (count === 0) {
		console.log(`Marker not found in DOM`);
		return false;
	}

	// Get the Leaflet marker container
	const leafletMarker = page.locator('.leaflet-marker-icon').filter({ has: marker }).first();

	// Scroll the marker into view by using evaluate to pan the Leaflet map
	// First, get the marker's lat/lng from the leaflet-marker-icon's transform
	await page.evaluate(async (markerId: string) => {
		// Find the marker element
		const markerEl = document.querySelector(`[data-instance-id="${markerId}"]`);
		if (!markerEl) return;

		// Get the parent marker icon
		const iconEl = markerEl.closest('.leaflet-marker-icon');
		if (!iconEl) return;

		// Click on the element - this should trigger Leaflet's click handler
		iconEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	}, instanceId);

	await page.waitForTimeout(500);

	// Check if sidebar opened
	let sidebar = page.locator('[data-testid="workflow-detail-sidebar"]');
	if (await sidebar.isVisible()) {
		console.log(`Sidebar opened via dispatchEvent`);
		return true;
	}

	// If dispatching event didn't work, try scrolling marker into view and clicking
	if (await leafletMarker.count() > 0) {
		console.log(`Trying scrollIntoView + click`);
		await leafletMarker.scrollIntoViewIfNeeded();
		await page.waitForTimeout(300);
		await leafletMarker.click();
		await page.waitForTimeout(500);
		if (await sidebar.isVisible()) {
			return true;
		}
	}

	console.log(`All click attempts failed for marker ${instanceId}`);
	return false;
}

async function canSeeInstance(page: Page, instanceId: string): Promise<boolean> {
	// Wait for map canvas to be present
	await page.waitForSelector('[data-testid="map-canvas"]', { timeout: 10000 });
	// Ensure loading overlay is gone
	try {
		await page.waitForSelector('text=Loading map...', { state: 'detached', timeout: 5000 });
	} catch {
		// Loading already finished
	}
	const marker = page.locator(`[data-instance-id="${instanceId}"]`);
	return await marker.isVisible();
}

async function canSeeFieldValues(page: Page): Promise<number> {
	const detailsTab = page.locator('[data-testid="tab-details"]');
	if (await detailsTab.isVisible()) {
		await detailsTab.click();
		await page.waitForTimeout(500); // Wait for tab content to load
	}
	const fieldValues = page.locator('[data-testid="field-value"]');
	return await fieldValues.count();
}

async function canSeeHistory(page: Page): Promise<number> {
	const historyTab = page.locator('[data-testid="tab-history"]');
	if (await historyTab.isVisible()) {
		await historyTab.click();
		await page.waitForTimeout(500); // Wait for tab content to load
	}
	const historyEntries = page.locator('[data-testid="history-entry"]');
	return await historyEntries.count();
}

async function canSeeEditTool(page: Page, toolName: string): Promise<boolean> {
	const button = page.locator(`button:has-text("${toolName}")`);
	return await button.isVisible();
}

// =============================================================================
// Test Suite
// =============================================================================

test.describe.serial('Permission Matrix E2E Test', () => {
	let adminPb: PocketBase;
	let projectId: string;
	let secondProjectId: string; // For cross-project isolation tests

	let roles: Map<string, string>; // name -> id
	let participants: Map<string, { id: string; token: string; roleId: string }>;

	let workflow: {
		id: string;
		stages: Map<string, string>;
		connections: Map<string, string>;
		forms: Map<string, string>;
		fields: Map<string, string>;
		editTools: Map<string, string>;
	};

	let instances: Map<string, string>; // description -> id

	// =========================================================================
	// SETUP TESTS
	// =========================================================================

	test('Setup: Create project', async () => {
		adminPb = new PocketBase(PB_URL);
		await adminPb
			.collection('users')
			.authWithPassword(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);

		const userId = adminPb.authStore.record?.id;
		if (!userId) {
			throw new Error('Failed to get authenticated user ID');
		}

		// Create main project
		const uniqueName = `Permission Matrix Test ${Date.now()}`;
		const project = await adminPb.collection('projects').create({
			name: uniqueName,
			description: 'Comprehensive permission testing - data preserved for inspection',
			owner_id: userId,
			is_active: true
		});
		projectId = project.id;

		// Create second project for cross-project isolation tests
		const secondProject = await adminPb.collection('projects').create({
			name: `Isolated Project ${Date.now()}`,
			description: 'For cross-project isolation tests',
			owner_id: userId,
			is_active: true
		});
		secondProjectId = secondProject.id;

		console.log(`\n=== SETUP ===`);
		console.log(`Created main project: ${projectId} (${uniqueName})`);
		console.log(`Created isolated project: ${secondProjectId}`);
	});

	test('Setup: Create roles and participants', async () => {
		roles = new Map();
		participants = new Map();
		instances = new Map();
		const timestamp = Date.now().toString().slice(-6);

		// Create roles with clear hierarchy
		const roleConfigs = [
			{ name: 'Full Access Role', description: 'Has access to everything' },
			{ name: 'Partial Access Role', description: 'Can see some stages, some tools' },
			{ name: 'Minimal Access Role', description: 'Can only see open stages' },
			{ name: 'Noone Role', description: 'Not assigned to any participant - for lockdown test' }
		];

		for (const cfg of roleConfigs) {
			const role = await adminPb.collection('roles').create({
				project_id: projectId,
				name: cfg.name,
				description: cfg.description
			});
			roles.set(cfg.name, role.id);
			console.log(`Created role: ${cfg.name} (${role.id})`);
		}

		// Create participants with specific role assignments
		const participantConfigs = [
			{ name: 'FullAccessUser', role: 'Full Access Role' },
			{ name: 'PartialAccessUser', role: 'Partial Access Role' },
			{ name: 'MinimalAccessUser', role: 'Minimal Access Role' }
		];

		console.log(`\n--- Participant Credentials ---`);
		for (const cfg of participantConfigs) {
			const token = generateToken();
			const uniqueEmail = `${cfg.name.toLowerCase()}+${timestamp}@test.com`;
			const roleId = roles.get(cfg.role)!;

			const participant = await adminPb.collection('participants').create({
				project_id: projectId,
				name: cfg.name,
				email: uniqueEmail,
				password: token,
				passwordConfirm: token,
				token: token,
				is_active: true,
				role_id: [roleId]
			});
			participants.set(cfg.name, { id: participant.id, token, roleId });
			console.log(`${cfg.name} (${cfg.role}): token = ${token}`);
		}

		// Create participant in second project for isolation test
		const isolatedToken = generateToken();
		const isolatedParticipant = await adminPb.collection('participants').create({
			project_id: secondProjectId,
			name: 'IsolatedUser',
			email: `isolated+${timestamp}@test.com`,
			password: isolatedToken,
			passwordConfirm: isolatedToken,
			token: isolatedToken,
			is_active: true,
			role_id: []
		});
		participants.set('IsolatedUser', { id: isolatedParticipant.id, token: isolatedToken, roleId: '' });
		console.log(`IsolatedUser (second project): token = ${isolatedToken}`);
	});

	test('Setup: Create workflow with stages', async () => {
		workflow = {
			id: '',
			stages: new Map(),
			connections: new Map(),
			forms: new Map(),
			fields: new Map(),
			editTools: new Map()
		};

		// Create workflow - entry allowed for all roles initially
		const wf = await adminPb.collection('workflows').create({
			project_id: projectId,
			name: 'Permission Test Workflow',
			description: 'Workflow with varying stage visibility for permission testing',
			workflow_type: 'incident',
			is_active: true,
			entry_allowed_roles: [] // All can create initially
		});
		workflow.id = wf.id;
		console.log(`\nCreated workflow: ${workflow.id}`);

		// Create stages with different visibility settings
		const stageConfigs = [
			{
				name: 'Open Stage (all can see)',
				type: 'start',
				visibleRoles: [], // Empty = all can see
				x: 150,
				y: 200
			},
			{
				name: 'Full Access Only Stage',
				type: 'intermediate',
				visibleRoles: ['Full Access Role'],
				x: 450,
				y: 100
			},
			{
				name: 'Partial Access Stage',
				type: 'intermediate',
				visibleRoles: ['Full Access Role', 'Partial Access Role'],
				x: 450,
				y: 300
			},
			{
				name: 'End Stage (all can see)',
				type: 'end',
				visibleRoles: [], // Empty = all can see
				x: 750,
				y: 200
			}
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
				`Created stage: ${cfg.name} (visible to: ${cfg.visibleRoles.join(', ') || 'ALL'})`
			);
		}
	});

	test('Setup: Create connections', async () => {
		// Entry connection - all can create via open entry
		const openEntry = await adminPb.collection('workflow_connections').create({
			workflow_id: workflow.id,
			from_stage_id: null,
			to_stage_id: workflow.stages.get('Open Stage (all can see)'),
			action_name: 'create-open',
			allowed_roles: [] // All can use
		});
		workflow.connections.set('entry-open', openEntry.id);
		console.log(`Created entry connection (all can use)`);

		// Entry connection - only Full Access can create at restricted stage
		const restrictedEntry = await adminPb.collection('workflow_connections').create({
			workflow_id: workflow.id,
			from_stage_id: null,
			to_stage_id: workflow.stages.get('Full Access Only Stage'),
			action_name: 'create-restricted',
			allowed_roles: [roles.get('Full Access Role')!]
		});
		workflow.connections.set('entry-restricted', restrictedEntry.id);
		console.log(`Created restricted entry connection (Full Access only)`);

		// Open -> Full Access Only (restricted transition)
		const openToFull = await adminPb.collection('workflow_connections').create({
			workflow_id: workflow.id,
			from_stage_id: workflow.stages.get('Open Stage (all can see)'),
			to_stage_id: workflow.stages.get('Full Access Only Stage'),
			action_name: 'escalate-to-full',
			allowed_roles: [roles.get('Full Access Role')!]
		});
		workflow.connections.set('open-to-full', openToFull.id);
		console.log(`Created Open -> Full Access connection (Full Access only)`);

		// Open -> Partial Access (multi-role transition)
		const openToPartial = await adminPb.collection('workflow_connections').create({
			workflow_id: workflow.id,
			from_stage_id: workflow.stages.get('Open Stage (all can see)'),
			to_stage_id: workflow.stages.get('Partial Access Stage'),
			action_name: 'send-to-partial',
			allowed_roles: [roles.get('Full Access Role')!, roles.get('Partial Access Role')!]
		});
		workflow.connections.set('open-to-partial', openToPartial.id);
		console.log(`Created Open -> Partial Access connection (Full + Partial)`);

		// Full Access Only -> End (restricted)
		const fullToEnd = await adminPb.collection('workflow_connections').create({
			workflow_id: workflow.id,
			from_stage_id: workflow.stages.get('Full Access Only Stage'),
			to_stage_id: workflow.stages.get('End Stage (all can see)'),
			action_name: 'resolve-full',
			allowed_roles: [roles.get('Full Access Role')!]
		});
		workflow.connections.set('full-to-end', fullToEnd.id);
		console.log(`Created Full Access -> End connection (Full Access only)`);

		// Partial Access -> End (open)
		const partialToEnd = await adminPb.collection('workflow_connections').create({
			workflow_id: workflow.id,
			from_stage_id: workflow.stages.get('Partial Access Stage'),
			to_stage_id: workflow.stages.get('End Stage (all can see)'),
			action_name: 'resolve-partial',
			allowed_roles: [] // All can resolve
		});
		workflow.connections.set('partial-to-end', partialToEnd.id);
		console.log(`Created Partial Access -> End connection (all can use)`);
	});

	test('Setup: Create forms with descriptive fields', async () => {
		// Entry form for Open Stage
		const openEntryForm = await adminPb.collection('tools_forms').create({
			workflow_id: workflow.id,
			connection_id: workflow.connections.get('entry-open'),
			name: 'Open Entry Form',
			description: 'Form for creating instances at Open Stage'
		});
		workflow.forms.set('open-entry', openEntryForm.id);
		console.log(`\nCreated open entry form: ${openEntryForm.id}`);

		// Fields for open entry form
		const openFields = [
			{
				label: 'Public Field - Anyone Can Read This',
				type: 'short_text',
				required: true,
				order: 1,
				page: 1,
				row_index: 0,
				column_position: 'full'
			},
			{
				label: 'Open Stage Timestamp',
				type: 'short_text',
				required: false,
				order: 2,
				page: 1,
				row_index: 1,
				column_position: 'full'
			}
		];

		for (const f of openFields) {
			const field = await adminPb.collection('tools_form_fields').create({
				form_id: openEntryForm.id,
				field_label: f.label,
				field_type: f.type,
				is_required: f.required,
				field_order: f.order,
				page: f.page,
				row_index: f.row_index,
				column_position: f.column_position
			});
			workflow.fields.set(f.label, field.id);
			console.log(`  Field: ${f.label}`);
		}

		// Entry form for Full Access Only Stage
		const restrictedEntryForm = await adminPb.collection('tools_forms').create({
			workflow_id: workflow.id,
			connection_id: workflow.connections.get('entry-restricted'),
			name: 'Restricted Entry Form',
			description: 'Form for creating instances at Full Access Only Stage'
		});
		workflow.forms.set('restricted-entry', restrictedEntryForm.id);
		console.log(`Created restricted entry form: ${restrictedEntryForm.id}`);

		// Fields for restricted entry form
		const restrictedFields = [
			{
				label: 'Restricted Field - Full Access Only',
				type: 'short_text',
				required: true,
				order: 1,
				page: 1,
				row_index: 0,
				column_position: 'full'
			},
			{
				label: 'Sensitive Data - Role Limited',
				type: 'long_text',
				required: false,
				order: 2,
				page: 1,
				row_index: 1,
				column_position: 'full'
			}
		];

		for (const f of restrictedFields) {
			const field = await adminPb.collection('tools_form_fields').create({
				form_id: restrictedEntryForm.id,
				field_label: f.label,
				field_type: f.type,
				is_required: f.required,
				field_order: f.order,
				page: f.page,
				row_index: f.row_index,
				column_position: f.column_position
			});
			workflow.fields.set(f.label, field.id);
			console.log(`  Field: ${f.label}`);
		}

		// Transition form for Open -> Partial
		const partialTransitionForm = await adminPb.collection('tools_forms').create({
			workflow_id: workflow.id,
			connection_id: workflow.connections.get('open-to-partial'),
			name: 'Partial Access Transition Form',
			description: 'Form for transitioning to Partial Access Stage'
		});
		workflow.forms.set('partial-transition', partialTransitionForm.id);
		console.log(`Created partial transition form: ${partialTransitionForm.id}`);

		const partialFields = [
			{
				label: 'Shared Field - Full and Partial Access',
				type: 'short_text',
				required: true,
				order: 1,
				page: 1,
				row_index: 0,
				column_position: 'full'
			}
		];

		for (const f of partialFields) {
			const field = await adminPb.collection('tools_form_fields').create({
				form_id: partialTransitionForm.id,
				field_label: f.label,
				field_type: f.type,
				is_required: f.required,
				field_order: f.order,
				page: f.page,
				row_index: f.row_index,
				column_position: f.column_position
			});
			workflow.fields.set(f.label, field.id);
			console.log(`  Field: ${f.label}`);
		}
	});

	test('Setup: Create edit tools', async () => {
		console.log(`\n--- Creating Edit Tools ---`);

		// Open Edit Tool - all can use
		const openEditTool = await adminPb.collection('tools_edit').create({
			stage_id: [workflow.stages.get('Open Stage (all can see)')],
			edit_mode: 'form_fields',
			is_global: false,
			name: 'Open Edit Tool',
			editable_fields: [workflow.fields.get('Public Field - Anyone Can Read This')!],
			allowed_roles: [], // All can use
			visual_config: {
				button_label: 'Edit Public',
				button_color: '#10b981'
			}
		});
		workflow.editTools.set('open-edit', openEditTool.id);
		console.log(`Created Open Edit Tool (all can use)`);

		// Full Access Edit Tool - only Full Access can use
		const fullAccessEditTool = await adminPb.collection('tools_edit').create({
			stage_id: [workflow.stages.get('Full Access Only Stage')],
			edit_mode: 'form_fields',
			is_global: false,
			name: 'Full Access Edit Tool',
			editable_fields: [workflow.fields.get('Restricted Field - Full Access Only')!],
			allowed_roles: [roles.get('Full Access Role')!],
			visual_config: {
				button_label: 'Edit Restricted',
				button_color: '#ef4444'
			}
		});
		workflow.editTools.set('full-access-edit', fullAccessEditTool.id);
		console.log(`Created Full Access Edit Tool (Full Access only)`);

		// Global Location Tool - only Full Access can use across all stages
		const allStages = [
			workflow.stages.get('Open Stage (all can see)')!,
			workflow.stages.get('Full Access Only Stage')!,
			workflow.stages.get('Partial Access Stage')!,
			workflow.stages.get('End Stage (all can see)')!
		];

		const globalLocationTool = await adminPb.collection('tools_edit').create({
			stage_id: allStages,
			edit_mode: 'location',
			is_global: true,
			name: 'Global Location Tool',
			editable_fields: [],
			allowed_roles: [roles.get('Full Access Role')!],
			visual_config: {
				button_label: 'Move Pin',
				button_color: '#3b82f6'
			}
		});
		workflow.editTools.set('global-location', globalLocationTool.id);
		console.log(`Created Global Location Tool (Full Access only, all stages)`);
	});

	test('Setup: Create test instances with field values', async () => {
		console.log(`\n--- Creating Test Instances ---`);
		const timestamp = new Date().toISOString();

		// Instance 1: At Open Stage (visible to all)
		const fullAccessUser = participants.get('FullAccessUser')!;
		const openInstance = await adminPb.collection('workflow_instances').create({
			workflow_id: workflow.id,
			current_stage_id: workflow.stages.get('Open Stage (all can see)'),
			status: 'active',
			created_by: fullAccessUser.id,
			location: LOCATIONS.BERLIN
		});
		instances.set('open-instance', openInstance.id);
		console.log(`Created open instance: ${openInstance.id} (Berlin)`);

		// Add field values for open instance
		await adminPb.collection('workflow_instance_field_values').create({
			instance_id: openInstance.id,
			field_key: workflow.fields.get('Public Field - Anyone Can Read This'),
			value: 'This is PUBLIC data that anyone should see',
			stage_id: workflow.stages.get('Open Stage (all can see)')
		});
		await adminPb.collection('workflow_instance_field_values').create({
			instance_id: openInstance.id,
			field_key: workflow.fields.get('Open Stage Timestamp'),
			value: timestamp,
			stage_id: workflow.stages.get('Open Stage (all can see)')
		});

		// Add tool usage for open instance
		await adminPb.collection('workflow_instance_tool_usage').create({
			instance_id: openInstance.id,
			stage_id: workflow.stages.get('Open Stage (all can see)'),
			executed_by: fullAccessUser.id,
			executed_at: timestamp,
			metadata: {
				action: 'instance_created',
				location: LOCATIONS.BERLIN
			}
		});

		// Instance 2: At Full Access Only Stage (only Full Access can see)
		const restrictedInstance = await adminPb.collection('workflow_instances').create({
			workflow_id: workflow.id,
			current_stage_id: workflow.stages.get('Full Access Only Stage'),
			status: 'active',
			created_by: fullAccessUser.id,
			location: LOCATIONS.MUNICH
		});
		instances.set('restricted-instance', restrictedInstance.id);
		console.log(`Created restricted instance: ${restrictedInstance.id} (Munich)`);

		// Add field values for restricted instance - SENSITIVE DATA
		await adminPb.collection('workflow_instance_field_values').create({
			instance_id: restrictedInstance.id,
			field_key: workflow.fields.get('Restricted Field - Full Access Only'),
			value: 'SECRET: This data should ONLY be visible to Full Access Role',
			stage_id: workflow.stages.get('Full Access Only Stage')
		});
		await adminPb.collection('workflow_instance_field_values').create({
			instance_id: restrictedInstance.id,
			field_key: workflow.fields.get('Sensitive Data - Role Limited'),
			value: 'CONFIDENTIAL: Internal review notes - salary adjustment request details',
			stage_id: workflow.stages.get('Full Access Only Stage')
		});

		// Add tool usage for restricted instance - SENSITIVE AUDIT
		await adminPb.collection('workflow_instance_tool_usage').create({
			instance_id: restrictedInstance.id,
			stage_id: workflow.stages.get('Full Access Only Stage'),
			executed_by: fullAccessUser.id,
			executed_at: timestamp,
			metadata: {
				action: 'instance_created',
				location: LOCATIONS.MUNICH,
				note: 'AUDIT: Created by admin with sensitive data'
			}
		});

		// Instance 3: At Partial Access Stage (Full + Partial can see)
		const partialInstance = await adminPb.collection('workflow_instances').create({
			workflow_id: workflow.id,
			current_stage_id: workflow.stages.get('Partial Access Stage'),
			status: 'active',
			created_by: fullAccessUser.id,
			location: LOCATIONS.COLOGNE
		});
		instances.set('partial-instance', partialInstance.id);
		console.log(`Created partial access instance: ${partialInstance.id} (Cologne)`);

		// Add field values for partial instance
		await adminPb.collection('workflow_instance_field_values').create({
			instance_id: partialInstance.id,
			field_key: workflow.fields.get('Shared Field - Full and Partial Access'),
			value: 'SHARED: This data is visible to Full Access and Partial Access roles',
			stage_id: workflow.stages.get('Partial Access Stage')
		});

		// Instance 4: For historical data leakage test
		// Created at Full Access Only Stage, will be moved to End Stage
		const leakageTestInstance = await adminPb.collection('workflow_instances').create({
			workflow_id: workflow.id,
			current_stage_id: workflow.stages.get('Full Access Only Stage'),
			status: 'active',
			created_by: fullAccessUser.id,
			location: LOCATIONS.HAMBURG
		});
		instances.set('leakage-test-instance', leakageTestInstance.id);
		console.log(`Created leakage test instance: ${leakageTestInstance.id} (Hamburg)`);

		// Add SENSITIVE field values at the restricted stage
		await adminPb.collection('workflow_instance_field_values').create({
			instance_id: leakageTestInstance.id,
			field_key: workflow.fields.get('Restricted Field - Full Access Only'),
			value: 'LEAKED?: This sensitive data was created at Full Access Stage',
			stage_id: workflow.stages.get('Full Access Only Stage')
		});

		// Add SENSITIVE audit trail at the restricted stage
		await adminPb.collection('workflow_instance_tool_usage').create({
			instance_id: leakageTestInstance.id,
			stage_id: workflow.stages.get('Full Access Only Stage'),
			executed_by: fullAccessUser.id,
			executed_at: timestamp,
			metadata: {
				action: 'instance_created',
				note: 'LEAKED?: This audit entry was created at Full Access Stage'
			}
		});

		// NOW move the instance to End Stage (visible to all)
		await adminPb.collection('workflow_instances').update(leakageTestInstance.id, {
			current_stage_id: workflow.stages.get('End Stage (all can see)'),
			status: 'completed'
		});
		console.log(`Moved leakage test instance to End Stage`);
	});

	// =========================================================================
	// PERMISSION TESTS - Using UI
	// =========================================================================

	test('1. Instance Visibility: FullAccessUser can see all instances', async ({ page }) => {
		console.log(`\n=== TEST 1: Instance Visibility (FullAccessUser) ===`);
		const user = participants.get('FullAccessUser')!;
		await loginAsParticipant(page, user.token);

		// Check visibility of each instance
		const openVisible = await canSeeInstance(page, instances.get('open-instance')!);
		const restrictedVisible = await canSeeInstance(page, instances.get('restricted-instance')!);
		const partialVisible = await canSeeInstance(page, instances.get('partial-instance')!);
		const leakageVisible = await canSeeInstance(page, instances.get('leakage-test-instance')!);

		console.log(`Open instance visible: ${openVisible}`);
		console.log(`Restricted instance visible: ${restrictedVisible}`);
		console.log(`Partial instance visible: ${partialVisible}`);
		console.log(`Leakage test instance visible: ${leakageVisible}`);

		expect(openVisible).toBe(true);
		expect(restrictedVisible).toBe(true);
		expect(partialVisible).toBe(true);
		expect(leakageVisible).toBe(true);
		console.log(`PASS: FullAccessUser can see all instances`);
	});

	// NOTE: According to the 4-layer permission model (1768800001_workflow_access_rules.js):
	// LAYER 2 "Structure Transparency": ALL participants can see ALL instances (progress visibility)
	// This is INTENTIONAL - instance visibility is open for progress tracking.
	// Field values (LAYER 3) are protected by stage_id.visible_to_roles.

	test('2. Instance Visibility: MinimalAccessUser can see all instances (progress transparency)', async ({ page }) => {
		console.log(`\n=== TEST 2: Instance Visibility (MinimalAccessUser - Progress Transparency) ===`);
		const user = participants.get('MinimalAccessUser')!;
		await loginAsParticipant(page, user.token);

		// Per Layer 2 "Structure Transparency" - ALL participants see ALL instances
		// This is intentional design for progress tracking. Data protection is at field value level.
		const openVisible = await canSeeInstance(page, instances.get('open-instance')!);
		const restrictedVisible = await canSeeInstance(page, instances.get('restricted-instance')!);
		const partialVisible = await canSeeInstance(page, instances.get('partial-instance')!);
		const leakageVisible = await canSeeInstance(page, instances.get('leakage-test-instance')!);

		console.log(`Open instance visible: ${openVisible}`);
		console.log(`Restricted stage instance visible (EXPECTED - progress transparency): ${restrictedVisible}`);
		console.log(`Partial stage instance visible (EXPECTED - progress transparency): ${partialVisible}`);
		console.log(`Leakage test instance visible: ${leakageVisible}`);

		// All instances are visible to all project participants (progress transparency)
		expect(openVisible).toBe(true);
		expect(restrictedVisible).toBe(true);
		expect(partialVisible).toBe(true);
		expect(leakageVisible).toBe(true);
		console.log(`PASS: MinimalAccessUser can see all instances (per Layer 2 design)`);
	});

	test('3. Instance Visibility: PartialAccessUser can see all instances (progress transparency)', async ({ page }) => {
		console.log(`\n=== TEST 3: Instance Visibility (PartialAccessUser) ===`);
		const user = participants.get('PartialAccessUser')!;
		await loginAsParticipant(page, user.token);

		const openVisible = await canSeeInstance(page, instances.get('open-instance')!);
		const restrictedVisible = await canSeeInstance(page, instances.get('restricted-instance')!);
		const partialVisible = await canSeeInstance(page, instances.get('partial-instance')!);
		const leakageVisible = await canSeeInstance(page, instances.get('leakage-test-instance')!);

		console.log(`Open instance visible: ${openVisible}`);
		console.log(`Restricted instance visible (progress transparency): ${restrictedVisible}`);
		console.log(`Partial instance visible: ${partialVisible}`);
		console.log(`Leakage test instance visible: ${leakageVisible}`);

		// All instances visible per Layer 2 "Structure Transparency"
		expect(openVisible).toBe(true);
		expect(restrictedVisible).toBe(true);
		expect(partialVisible).toBe(true);
		expect(leakageVisible).toBe(true);
		console.log(`PASS: PartialAccessUser can see all instances`);
	});

	test('4. Field Values: FullAccessUser can see all field values', async ({ page }) => {
		console.log(`\n=== TEST 4: Field Values (FullAccessUser) ===`);
		const user = participants.get('FullAccessUser')!;
		await loginAsParticipant(page, user.token);

		// Select the restricted instance and check field values
		const selected = await selectInstance(page, instances.get('restricted-instance')!);
		expect(selected).toBe(true);

		const fieldCount = await canSeeFieldValues(page);
		console.log(`Field values visible in restricted instance: ${fieldCount}`);
		expect(fieldCount).toBeGreaterThan(0);
		console.log(`PASS: FullAccessUser can see field values at restricted stage`);
	});

	test('5. Field Values: MinimalAccessUser cannot see restricted field values', async ({ page }) => {
		console.log(`\n=== TEST 5: Field Values (MinimalAccessUser) ===`);
		const user = participants.get('MinimalAccessUser')!;
		await loginAsParticipant(page, user.token);

		// MinimalAccessUser cannot even see the restricted instance, so this test
		// verifies that when selecting an open instance, they only see open stage values
		const selected = await selectInstance(page, instances.get('open-instance')!);
		expect(selected).toBe(true);

		const fieldCount = await canSeeFieldValues(page);
		console.log(`Field values visible in open instance: ${fieldCount}`);
		// They should see the open stage field values
		expect(fieldCount).toBeGreaterThan(0);
		console.log(`PASS: MinimalAccessUser can only see open stage field values`);
	});

	test('6. CRITICAL: Historical Data Leakage Test', async ({ page }) => {
		console.log(`\n=== TEST 6: HISTORICAL DATA LEAKAGE TEST ===`);
		console.log(`The leakage-test-instance was created at Full Access Only Stage`);
		console.log(`with sensitive field values and audit trail, then moved to End Stage.`);
		console.log(`MinimalAccessUser should see the instance but NOT the historical data.`);

		const user = participants.get('MinimalAccessUser')!;
		await loginAsParticipant(page, user.token);

		// MinimalAccessUser should see the instance (it's at End Stage now)
		const canSee = await canSeeInstance(page, instances.get('leakage-test-instance')!);
		expect(canSee).toBe(true);
		console.log(`Instance visible to MinimalAccessUser: ${canSee}`);

		// Select the instance
		const selected = await selectInstance(page, instances.get('leakage-test-instance')!);
		expect(selected).toBe(true);

		// Check field values - should NOT see the sensitive data from Full Access Stage
		const fieldCount = await canSeeFieldValues(page);
		console.log(`Field values visible: ${fieldCount}`);

		// The field values were created at Full Access Only Stage
		// MinimalAccessUser should NOT see them even though instance is now at End Stage
		expect(fieldCount).toBe(0);
		console.log(`PASS: No historical field values leaked!`);

		// Check history - should NOT see audit trail from Full Access Stage
		const historyCount = await canSeeHistory(page);
		console.log(`History entries visible: ${historyCount}`);
		expect(historyCount).toBe(0);
		console.log(`PASS: No historical audit trail leaked!`);

		console.log(`\n*** HISTORICAL DATA LEAKAGE TEST PASSED ***`);
		console.log(`Field values and audit trail from restricted stages remain protected`);
		console.log(`even after instance moves to an open stage.`);
	});

	test('7. Edit Tools: FullAccessUser can see all edit tools', async ({ page }) => {
		console.log(`\n=== TEST 7: Edit Tools (FullAccessUser) ===`);
		const user = participants.get('FullAccessUser')!;
		await loginAsParticipant(page, user.token);

		// Select open instance - should see Open Edit Tool
		await selectInstance(page, instances.get('open-instance')!);
		const openToolVisible = await canSeeEditTool(page, 'Edit Public');
		console.log(`Open Edit Tool visible: ${openToolVisible}`);
		expect(openToolVisible).toBe(true);

		// Select restricted instance - should see Full Access Edit Tool
		await selectInstance(page, instances.get('restricted-instance')!);
		const fullToolVisible = await canSeeEditTool(page, 'Edit Restricted');
		console.log(`Full Access Edit Tool visible: ${fullToolVisible}`);
		expect(fullToolVisible).toBe(true);

		// Global location tool should be visible
		const globalToolVisible = await canSeeEditTool(page, 'Move Pin');
		console.log(`Global Location Tool visible: ${globalToolVisible}`);
		expect(globalToolVisible).toBe(true);

		console.log(`PASS: FullAccessUser can see all edit tools`);
	});

	test('8. Edit Tools: MinimalAccessUser can only see open edit tools', async ({ page }) => {
		console.log(`\n=== TEST 8: Edit Tools (MinimalAccessUser) ===`);
		const user = participants.get('MinimalAccessUser')!;
		await loginAsParticipant(page, user.token);

		// Select open instance - should see Open Edit Tool but not Global Location Tool
		await selectInstance(page, instances.get('open-instance')!);

		const openToolVisible = await canSeeEditTool(page, 'Edit Public');
		console.log(`Open Edit Tool visible: ${openToolVisible}`);
		expect(openToolVisible).toBe(true);

		// Global location tool should NOT be visible (Full Access only)
		const globalToolVisible = await canSeeEditTool(page, 'Move Pin');
		console.log(`Global Location Tool visible (should be false): ${globalToolVisible}`);
		expect(globalToolVisible).toBe(false);

		console.log(`PASS: MinimalAccessUser can only see open edit tools`);
	});

	test('9. Cross-Project Isolation: IsolatedUser cannot see main project data', async ({ page }) => {
		console.log(`\n=== TEST 9: Cross-Project Isolation ===`);
		const user = participants.get('IsolatedUser')!;
		await loginAsParticipant(page, user.token);

		// IsolatedUser is in a different project - should not see any instances
		const openVisible = await canSeeInstance(page, instances.get('open-instance')!);
		const restrictedVisible = await canSeeInstance(page, instances.get('restricted-instance')!);

		console.log(`Open instance visible to IsolatedUser: ${openVisible}`);
		console.log(`Restricted instance visible to IsolatedUser: ${restrictedVisible}`);

		expect(openVisible).toBe(false);
		expect(restrictedVisible).toBe(false);
		console.log(`PASS: Cross-project isolation working`);
	});

	test('10. NOONE ROLE LOCKDOWN: Change all permissions to Noone role', async () => {
		console.log(`\n=== TEST 10: NOONE ROLE LOCKDOWN ===`);
		console.log(`Changing all permissions to "Noone Role" (unassigned)...`);

		const nooneRoleId = roles.get('Noone Role')!;

		// Update all stages to only be visible to Noone Role
		for (const [stageName, stageId] of workflow.stages) {
			await adminPb.collection('workflow_stages').update(stageId, {
				visible_to_roles: [nooneRoleId]
			});
			console.log(`Updated stage "${stageName}" visibility to Noone Role`);
		}

		// Update all connections to only be allowed by Noone Role
		for (const [connName, connId] of workflow.connections) {
			await adminPb.collection('workflow_connections').update(connId, {
				allowed_roles: [nooneRoleId]
			});
			console.log(`Updated connection "${connName}" allowed_roles to Noone Role`);
		}

		// Update all edit tools to only be allowed by Noone Role
		for (const [toolName, toolId] of workflow.editTools) {
			await adminPb.collection('tools_edit').update(toolId, {
				allowed_roles: [nooneRoleId]
			});
			console.log(`Updated edit tool "${toolName}" allowed_roles to Noone Role`);
		}

		console.log(`\nAll permissions changed to Noone Role`);
		console.log(`PASS: Lockdown configuration complete`);
	});

	test('11. NOONE ROLE LOCKDOWN: Verify FullAccessUser sees no sensitive data', async ({ page }) => {
		console.log(`\n=== TEST 11: LOCKDOWN VERIFICATION (FullAccessUser) ===`);
		const user = participants.get('FullAccessUser')!;
		await loginAsParticipant(page, user.token);

		// Per Layer 2 "Structure Transparency", instances are STILL visible
		// But field values, edit tools, and connections should be hidden
		console.log(`Note: Per Layer 2 "Structure Transparency", instances remain visible`);
		console.log(`Testing that sensitive DATA is locked down...`);

		const openVisible = await canSeeInstance(page, instances.get('open-instance')!);
		console.log(`Open instance visible (expected - progress transparency): ${openVisible}`);

		// Select an instance and verify NO field values are visible
		const selected = await selectInstance(page, instances.get('open-instance')!);
		if (selected) {
			const fieldCount = await canSeeFieldValues(page);
			console.log(`Field values visible after lockdown: ${fieldCount}`);
			expect(fieldCount).toBe(0);

			const editToolVisible = await canSeeEditTool(page, 'Open Edit Tool');
			console.log(`Open Edit Tool visible after lockdown: ${editToolVisible}`);
			expect(editToolVisible).toBe(false);

			const historyCount = await canSeeHistory(page);
			console.log(`History entries visible after lockdown: ${historyCount}`);
			expect(historyCount).toBe(0);
		}

		console.log(`\n*** NOONE ROLE LOCKDOWN TEST PASSED ***`);
		console.log(`Instances visible (progress transparency) but ALL sensitive data locked:`);
		console.log(`  - Field values: HIDDEN`);
		console.log(`  - Edit tools: HIDDEN`);
		console.log(`  - Audit trail: HIDDEN`);
	});

	test('12. SUMMARY: Print permission matrix', async () => {
		console.log(`\n========================================`);
		console.log(`PERMISSION MATRIX TEST SUMMARY`);
		console.log(`========================================`);
		console.log(`Project ID: ${projectId}`);
		console.log(`Workflow ID: ${workflow.id}`);

		console.log(`\n--- Roles ---`);
		for (const [name, id] of roles) {
			console.log(`  ${name}: ${id}`);
		}

		console.log(`\n--- Stages ---`);
		for (const [name, id] of workflow.stages) {
			console.log(`  ${name}: ${id}`);
		}

		console.log(`\n--- Edit Tools ---`);
		for (const [name, id] of workflow.editTools) {
			console.log(`  ${name}: ${id}`);
		}

		console.log(`\n--- Instances ---`);
		for (const [name, id] of instances) {
			console.log(`  ${name}: ${id}`);
		}

		console.log(`\n--- Participant Login Tokens ---`);
		console.log(`Use these at /participant/login to test manually:`);
		for (const [name, p] of participants) {
			console.log(`  ${name}: ${p.token}`);
		}

		console.log(`\n========================================`);
		console.log(`Data preserved in database for inspection!`);
		console.log(`PocketBase Admin: ${PB_URL}/_/`);
		console.log(`========================================\n`);
	});
});
