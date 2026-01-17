import { test, expect } from '@playwright/test';
import {
	LoginPage,
	ProjectsPage,
	RolesPage,
	ParticipantsPage,
	WorkflowsPage,
	WorkflowBuilderPage
} from './pages';
import {
	ADMIN_CREDENTIALS,
	TEST_PROJECT,
	TEST_ROLES,
	TEST_PARTICIPANTS,
	TEST_WORKFLOW
} from './fixtures/test-data';

test.describe.serial('Admin Frontend - Database Seeding', () => {
	let projectId: string;
	let workflowId: string;

	test('login and create project', async ({ page }) => {
		const loginPage = new LoginPage(page);
		await loginPage.loginAndWaitForDashboard(
			ADMIN_CREDENTIALS.email,
			ADMIN_CREDENTIALS.password
		);

		// Verify we're on the projects page
		await expect(page.locator('h1')).toContainText('Projects');

		// Create project
		const projectsPage = new ProjectsPage(page);
		projectId = await projectsPage.createProject(
			TEST_PROJECT.name,
			TEST_PROJECT.description
		);

		expect(projectId).toBeTruthy();
		console.log('Created project with ID:', projectId);
	});

	test('create roles', async ({ page }) => {
		// Login and navigate directly to roles using stored projectId
		const loginPage = new LoginPage(page);
		await loginPage.loginAndWaitForDashboard(
			ADMIN_CREDENTIALS.email,
			ADMIN_CREDENTIALS.password
		);

		// If projectId not set, find it from the project
		if (!projectId) {
			const projectsPage = new ProjectsPage(page);
			await projectsPage.goto();
			await projectsPage.openProject(TEST_PROJECT.name);
			const url = page.url();
			const match = url.match(/\/projects\/([^/]+)\//);
			projectId = match ? match[1] : '';
		}

		// Navigate to roles
		const rolesPage = new RolesPage(page);
		await rolesPage.goto(projectId);

		// Create each role
		for (const role of TEST_ROLES) {
			await rolesPage.createRole(role.name, role.description);
			console.log('Created role:', role.name);
		}

		// Verify all roles were created
		const roleCount = await rolesPage.getRoleCount();
		expect(roleCount).toBeGreaterThanOrEqual(TEST_ROLES.length);
	});

	test('create participants', async ({ page }) => {
		const loginPage = new LoginPage(page);
		await loginPage.loginAndWaitForDashboard(
			ADMIN_CREDENTIALS.email,
			ADMIN_CREDENTIALS.password
		);

		if (!projectId) {
			const projectsPage = new ProjectsPage(page);
			await projectsPage.goto();
			await projectsPage.openProject(TEST_PROJECT.name);
			const url = page.url();
			const match = url.match(/\/projects\/([^/]+)\//);
			projectId = match ? match[1] : '';
		}

		const participantsPage = new ParticipantsPage(page);
		await participantsPage.goto(projectId);

		// Create each participant
		for (const participant of TEST_PARTICIPANTS) {
			await participantsPage.createParticipant(
				participant.name,
				participant.email
			);
			console.log('Created participant:', participant.name);
		}

		// Verify all participants were created
		const participantCount = await participantsPage.getParticipantCount();
		expect(participantCount).toBeGreaterThanOrEqual(TEST_PARTICIPANTS.length);
	});

	test('assign roles to participants', async ({ page }) => {
		const loginPage = new LoginPage(page);
		await loginPage.loginAndWaitForDashboard(
			ADMIN_CREDENTIALS.email,
			ADMIN_CREDENTIALS.password
		);

		if (!projectId) {
			const projectsPage = new ProjectsPage(page);
			await projectsPage.goto();
			await projectsPage.openProject(TEST_PROJECT.name);
			const url = page.url();
			const match = url.match(/\/projects\/([^/]+)\//);
			projectId = match ? match[1] : '';
		}

		const participantsPage = new ParticipantsPage(page);
		await participantsPage.goto(projectId);

		// Assign roles to each participant
		for (const participant of TEST_PARTICIPANTS) {
			for (const roleName of participant.roles) {
				await participantsPage.assignRoleToParticipant(
					participant.name,
					roleName
				);
				console.log(`Assigned role "${roleName}" to participant "${participant.name}"`);
			}
		}
	});

	test('create workflow', async ({ page }) => {
		const loginPage = new LoginPage(page);
		await loginPage.loginAndWaitForDashboard(
			ADMIN_CREDENTIALS.email,
			ADMIN_CREDENTIALS.password
		);

		if (!projectId) {
			const projectsPage = new ProjectsPage(page);
			await projectsPage.goto();
			await projectsPage.openProject(TEST_PROJECT.name);
			const url = page.url();
			const match = url.match(/\/projects\/([^/]+)\//);
			projectId = match ? match[1] : '';
		}

		const workflowsPage = new WorkflowsPage(page);
		await workflowsPage.goto(projectId);

		// Create the workflow (this will also navigate to the builder)
		workflowId = await workflowsPage.createWorkflow(
			TEST_WORKFLOW.name,
			TEST_WORKFLOW.description,
			TEST_WORKFLOW.type
		);

		expect(workflowId).toBeTruthy();
		console.log('Created workflow with ID:', workflowId);
	});

	test('build workflow with stages and connections', async ({ page }) => {
		const loginPage = new LoginPage(page);
		await loginPage.loginAndWaitForDashboard(
			ADMIN_CREDENTIALS.email,
			ADMIN_CREDENTIALS.password
		);

		if (!projectId) {
			const projectsPage = new ProjectsPage(page);
			await projectsPage.goto();
			await projectsPage.openProject(TEST_PROJECT.name);
			const url = page.url();
			const match = url.match(/\/projects\/([^/]+)\//);
			projectId = match ? match[1] : '';
		}

		const workflowsPage = new WorkflowsPage(page);
		await workflowsPage.goto(projectId);

		// Open the workflow builder
		await workflowsPage.openBuilder(TEST_WORKFLOW.name);

		// Get workflowId from URL
		const url = page.url();
		const match = url.match(/\/workflows\/([^/]+)\/builder/);
		workflowId = match ? match[1] : '';

		const builderPage = new WorkflowBuilderPage(page);
		await builderPage.waitForCanvas();

		// Add stages
		for (const stage of TEST_WORKFLOW.stages) {
			await builderPage.addStage(stage.type, { x: stage.x, y: stage.y });
			console.log('Added stage:', stage.type);
		}

		// Verify stages were added
		const stageCount = await builderPage.getStageCount();
		console.log('Stage count:', stageCount);
		expect(stageCount).toBeGreaterThanOrEqual(TEST_WORKFLOW.stages.length);

		// Save the workflow
		await builderPage.save();
		console.log('Workflow saved');
	});
});

// Single comprehensive test for quick seeding
test('Quick Seed - Complete project setup', async ({ page }) => {
	// Login
	const loginPage = new LoginPage(page);
	await loginPage.loginAndWaitForDashboard(
		ADMIN_CREDENTIALS.email,
		ADMIN_CREDENTIALS.password
	);

	// Create project with unique name
	const projectsPage = new ProjectsPage(page);
	const uniqueName = TEST_PROJECT.name + ' ' + Date.now().toString().slice(-6);
	const projectId = await projectsPage.createProject(
		uniqueName,
		TEST_PROJECT.description
	);
	console.log('Created project:', projectId);

	// Create roles
	const rolesPage = new RolesPage(page);
	await rolesPage.goto(projectId);
	for (const role of TEST_ROLES) {
		await rolesPage.createRole(role.name, role.description);
	}
	console.log('Created', TEST_ROLES.length, 'roles');

	// Create participants
	const participantsPage = new ParticipantsPage(page);
	await participantsPage.goto(projectId);
	for (const participant of TEST_PARTICIPANTS) {
		await participantsPage.createParticipant(participant.name, participant.email);
	}
	console.log('Created', TEST_PARTICIPANTS.length, 'participants');

	// Verify
	await rolesPage.goto(projectId);
	const roleCount = await rolesPage.getRoleCount();
	expect(roleCount).toBe(TEST_ROLES.length);

	await participantsPage.goto(projectId);
	const participantCount = await participantsPage.getParticipantCount();
	expect(participantCount).toBe(TEST_PARTICIPANTS.length);

	console.log('Seeding complete!');
});
