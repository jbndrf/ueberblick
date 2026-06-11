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
		const wf = await pb.collection('workflows').getFirstListItem(
			'name = "Damage Report Workflow"',
			{ sort: '-created' }
		);

		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(String(err)));

		// Login through the admin UI
		await page.goto('/admin/login');
		await page.fill('input[type="email"]', ADMIN_CREDENTIALS.email);
		await page.fill('input[type="password"]', ADMIN_CREDENTIALS.password);
		await page.click('button[type="submit"]');
		await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login'));

		await page.goto(`/admin/projects/${wf.project_id}/workflows/${wf.id}/builder`);

		// Catalog (left): stage palette present
		await expect(page.locator('.drag-item-start')).toBeVisible();
		await expect(page.locator('.drag-item-stage')).toBeVisible();

		// Canvas: stage nodes rendered
		await expect(page.locator('.svelte-flow__node').first()).toBeVisible();

		// Click a stage node -> stage inspector (participant preview)
		await page.locator('.svelte-flow__node-stage').first().click();
		await expect(page.locator('.inspector')).toBeVisible();

		// Click an edge -> connection inspector with sentry section
		await page.locator('.svelte-flow__edge:not(.entry-edge)').first().dispatchEvent('click');
		await expect(page.getByText(/Wächter|Sentry/).first()).toBeVisible();

		// Rename the connection action in the inspector -> save button becomes enabled
		const nameInput = page.locator('.connection-inspector input').first();
		await nameInput.fill('smoke-renamed');
		await nameInput.blur();
		const saveButton = page.getByRole('button', { name: /Speichern|Save/ }).first();
		await expect(saveButton).toBeEnabled();
		await saveButton.click();
		await expect(saveButton).toBeDisabled({ timeout: 15000 });

		// Persisted?
		const conns = await pb.collection('workflow_connections').getFullList({
			filter: `workflow_id = "${wf.id}" && action_name = "smoke-renamed"`
		});
		expect(conns.length).toBe(1);

		expect(errors, `page errors: ${errors.join('\n')}`).toEqual([]);
	});
});
