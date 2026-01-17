import { type Page, expect } from '@playwright/test';

export class RolesPage {
	constructor(private page: Page) {}

	// Selectors
	private pageTitle = 'h1:has-text("Roles")';
	private createRoleButton = 'button:has-text("Create Role")';
	private editModeToggle = 'button[role="switch"]';

	async goto(projectId: string) {
		await this.page.goto(`/projects/${projectId}/roles`);
		await this.page.waitForSelector(this.pageTitle);
	}

	async enableEditMode() {
		// Click directly on the switch toggle
		const toggle = this.page.locator('button[role="switch"]').first();
		await toggle.waitFor({ state: 'visible', timeout: 5000 });
		const isChecked = await toggle.getAttribute('data-state');
		if (isChecked !== 'checked') {
			await toggle.click({ force: true });
			await this.page.waitForTimeout(500);
		}
	}

	async createRole(name: string, description?: string) {
		// Enable edit mode first
		await this.enableEditMode();

		// Click the create role button to start inline creation
		await this.page.click(this.createRoleButton);

		// Wait for the new row to appear
		await this.page.waitForTimeout(300);

		// The row shows "-" placeholders - click the first cell (Role Name) to activate input
		const newRow = this.page.locator('table tbody tr').last();
		const nameCell = newRow.locator('td').nth(1); // First data cell (after checkbox)
		await nameCell.click();

		// Wait for input to appear and fill it
		await this.page.waitForTimeout(200);
		const nameInput = newRow.locator('input[type="text"]').first();
		await nameInput.fill(name);

		// If description provided, click and fill the second cell
		if (description) {
			const descCell = newRow.locator('td').nth(2);
			await descCell.click();
			await this.page.waitForTimeout(200);
			const descInput = newRow.locator('input[type="text"]').first();
			await descInput.fill(description);
		}

		// Click Save button
		await newRow.getByText('Save').click();

		// Wait for save to complete
		await this.page.waitForTimeout(500);
	}

	async getRoleNames(): Promise<string[]> {
		// Get the name cells from the table
		const nameCells = this.page.locator('table tbody tr td:first-child');
		const count = await nameCells.count();
		const names: string[] = [];
		for (let i = 0; i < count; i++) {
			const text = await nameCells.nth(i).textContent();
			if (text && !text.includes('No roles')) {
				names.push(text.trim());
			}
		}
		return names;
	}

	async roleExists(name: string): Promise<boolean> {
		const names = await this.getRoleNames();
		return names.includes(name);
	}

	async getRoleCount(): Promise<number> {
		const names = await this.getRoleNames();
		return names.length;
	}
}
