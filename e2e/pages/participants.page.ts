import { type Page, expect } from '@playwright/test';

export class ParticipantsPage {
	constructor(private page: Page) {}

	// Selectors
	private pageTitle = 'h1:has-text("Participants")';
	private createParticipantButton = 'button:has-text("Create Participant")';
	private tableRow = 'table tbody tr';
	private editModeToggle = 'button[role="switch"]';

	async goto(projectId: string) {
		await this.page.goto(`/projects/${projectId}/participants`);
		await this.page.waitForSelector(this.pageTitle);
	}

	async enableEditMode() {
		// Click directly on the switch toggle
		const toggle = this.page.locator(this.editModeToggle).first();
		await toggle.waitFor({ state: 'visible', timeout: 5000 });
		const isChecked = await toggle.getAttribute('data-state');
		if (isChecked !== 'checked') {
			await toggle.click({ force: true });
			await this.page.waitForTimeout(500);
		}
	}

	async createParticipant(name: string, email?: string, phone?: string) {
		// Enable edit mode first
		await this.enableEditMode();

		// Wait for the create button to be visible and click it
		const createButton = this.page.locator(this.createParticipantButton);
		await createButton.waitFor({ state: 'visible', timeout: 5000 });
		await createButton.click();

		// Wait for the new row with Save button to appear
		const newRow = this.page.locator('table tbody tr').last();
		const saveButton = newRow.getByText('Save', { exact: true });
		await saveButton.waitFor({ state: 'visible', timeout: 5000 });

		// The row shows "-" placeholders - click the first cell (Name) to activate input
		const nameCell = newRow.locator('td').nth(1); // First data cell (after checkbox)
		await nameCell.click();

		// Wait for input to appear and fill it
		const nameInput = newRow.locator('input[type="text"]').first();
		await nameInput.waitFor({ state: 'visible', timeout: 5000 });
		await nameInput.fill(name);

		// Press Tab to blur the input and commit the value to state
		await nameInput.press('Tab');
		await this.page.waitForTimeout(100);

		// Click Save button with force to ensure it's clicked
		await saveButton.click({ force: true });

		// Wait for the Create button to reappear (meaning save completed)
		await createButton.waitFor({ state: 'visible', timeout: 10000 });
	}

	async getParticipantNames(): Promise<string[]> {
		// Get the name cells from the table (first column)
		const nameCells = this.page.locator('table tbody tr td:first-child');
		const count = await nameCells.count();
		const names: string[] = [];
		for (let i = 0; i < count; i++) {
			const text = await nameCells.nth(i).textContent();
			if (text && !text.includes('No participants')) {
				names.push(text.trim());
			}
		}
		return names;
	}

	async participantExists(name: string): Promise<boolean> {
		const names = await this.getParticipantNames();
		return names.includes(name);
	}

	async getParticipantCount(): Promise<number> {
		const names = await this.getParticipantNames();
		return names.length;
	}

	async openEditRolesDialog(participantName: string) {
		// Find the row with the participant name and click the actions menu
		const row = this.page.locator(`table tbody tr:has-text("${participantName}")`);
		const actionsButton = row.locator('button[aria-haspopup="menu"]').last();
		await actionsButton.click();

		// Click "Edit Roles" in the dropdown
		await this.page.click('text=Edit Roles');

		// Wait for dialog to open
		await this.page.waitForSelector('[role="dialog"]');
	}

	async assignRoleToParticipant(participantName: string, roleName: string) {
		await this.openEditRolesDialog(participantName);

		// Click on the multi-select to open it
		const multiSelect = this.page.locator('[role="dialog"] button:has-text("Select")');
		if (await multiSelect.isVisible()) {
			await multiSelect.click();
		}

		// Select the role from the list
		await this.page.click(`text="${roleName}"`);

		// Close the dropdown by clicking elsewhere
		await this.page.keyboard.press('Escape');

		// Click Save
		await this.page.click('[role="dialog"] button:has-text("Save")');

		// Wait for dialog to close
		await this.page.waitForSelector('[role="dialog"]', { state: 'hidden' });
		await this.page.waitForTimeout(300);
	}
}
