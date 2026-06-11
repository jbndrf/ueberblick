import { test, expect } from '@playwright/test';
import PocketBase from 'pocketbase';
import { ADMIN_CREDENTIALS } from './fixtures/test-data';

const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://localhost:8090';

/**
 * Smoke test for the refactored builder shell:
 * catalog (left) + canvas (center) + inspector (right).
 * Uses the workflow seeded by comprehensive-workflow.test.ts.
 */
test.describe('Builder refactor smoke', () => {
	test('catalog, canvas, inspectors and save roundtrip', async ({ page }) => {
		const pb = new PocketBase(PB_URL);
		await pb
			.collection('users')
			.authWithPassword(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
		const wf = await pb
			.collection('workflows')
			.getFirstListItem('name = "Damage Report Workflow"', { sort: '-created' });

		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(String(err)));

		// Login through the admin UI
		await page.goto('/admin/login');
		await page.fill('input[type="email"]', ADMIN_CREDENTIALS.email);
		await page.fill('input[type="password"]', ADMIN_CREDENTIALS.password);
		await page.click('button[type="submit"]');
		await page.waitForURL(
			(url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login')
		);

		await page.goto(`/admin/projects/${wf.project_id}/workflows/${wf.id}/builder`);

		// Catalog (left): stage palette present
		await expect(page.locator('.drag-item-start')).toBeVisible();
		await expect(page.locator('.drag-item-stage')).toBeVisible();

		// Canvas: stage nodes rendered (generous timeout — dev server may compile)
		await expect(page.locator('.svelte-flow__node').first()).toBeVisible({ timeout: 30000 });

		// Click a stage node -> stage inspector (participant preview)
		await page.locator('.svelte-flow__node-stage').first().click();
		await expect(page.locator('.inspector')).toBeVisible();

		// Click an edge -> connection inspector with sentry section
		await page.locator('.svelte-flow__edge:not(.entry-edge)').first().dispatchEvent('click');
		await expect(page.getByText(/Wächter|Sentry/).first()).toBeVisible();

		// Rename the connection action in the inspector -> save button becomes enabled
		const renamed = `smoke-renamed-${Date.now()}`;
		const nameInput = page.locator('.connection-inspector input').first();
		await nameInput.fill(renamed);
		await nameInput.blur();
		const saveButton = page.getByRole('button', { name: /Speichern|Save/ }).first();
		await expect(saveButton).toBeEnabled();
		await saveButton.click();
		await expect(saveButton).toBeDisabled({ timeout: 15000 });

		// Persisted?
		const conns = await pb.collection('workflow_connections').getFullList({
			filter: `workflow_id = "${wf.id}" && action_name = "${renamed}"`
		});
		expect(conns.length).toBe(1);

		// --- Entity YAML toggle: connection serializes with sentry/action keys ---
		await page.locator('.inspector .mode-btn', { hasText: 'YAML' }).click();
		await expect(page.locator('.entity-yaml')).toContainText('action:');
		await page.locator('.inspector .mode-btn').first().click();
		await expect(page.locator('.connection-inspector')).toBeVisible();

		// --- Model tab: all entity sections + bulk permissions matrix ---
		await page.getByRole('button', { name: /^(Modell|Model)$/ }).click();
		await expect(page.getByRole('heading', { name: /Stufen|Stages/ })).toBeVisible();
		await expect(page.getByRole('heading', { name: /Verbindungen|Connections/ })).toBeVisible();
		await expect(page.getByRole('heading', { name: /Felder|Fields/ }).first()).toBeVisible();
		await expect(
			page.getByRole('heading', { name: /Berechtigungen|Permissions/ }).first()
		).toBeVisible();

		// Inline rename in the model tab marks the builder dirty
		const stageInput = page.locator('.model-overview .inline-input').first();
		await stageInput.fill('Model Renamed Stage');
		await stageInput.blur();
		await expect(page.getByRole('button', { name: /Speichern|Save/ }).first()).toBeEnabled();

		// Deep-link: reveal button jumps back to the canvas with the inspector open
		await page.locator('.model-overview .reveal-btn').first().click();
		await expect(page.locator('.svelte-flow__node').first()).toBeVisible();
		await expect(page.locator('.inspector')).toContainText('Model Renamed Stage');

		expect(errors, `page errors: ${errors.join('\n')}`).toEqual([]);
	});
});
