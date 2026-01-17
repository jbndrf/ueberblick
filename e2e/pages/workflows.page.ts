import { type Page, expect } from '@playwright/test';

export class WorkflowsPage {
	constructor(private page: Page) {}

	// Selectors
	private pageTitle = 'h1:has-text("Workflows")';
	private createWorkflowButton = 'button:has-text("Create Workflow")';
	private tableRow = 'table tbody tr';

	async goto(projectId: string) {
		await this.page.goto(`/projects/${projectId}/workflows`);
		await this.page.waitForSelector(this.pageTitle);
	}

	async createWorkflow(
		name: string,
		description?: string,
		workflowType: 'incident' | 'survey' = 'incident'
	): Promise<string> {
		// Click the create workflow button to start inline creation
		await this.page.click(this.createWorkflowButton);

		// Wait for the inline creation row to appear
		await this.page.waitForTimeout(300);

		// Find the new row (last row) and fill in the details
		const rows = this.page.locator(this.tableRow);
		const lastRow = rows.last();

		// Fill name in the first input
		const nameInput = lastRow.locator('input[type="text"]').first();
		await nameInput.fill(name);

		// Fill description if provided
		if (description) {
			const descInput = lastRow.locator('input[type="text"]').nth(1);
			await descInput.fill(description);
		}

		// Select workflow type via dropdown if not default
		if (workflowType !== 'incident') {
			const typeDropdown = lastRow.locator('button:has-text("Incident"), button:has-text("Survey")');
			await typeDropdown.click();
			await this.page.click(`text="${workflowType === 'survey' ? 'Survey' : 'Incident'}"`);
		}

		// Press Enter to save
		await nameInput.press('Enter');

		// Wait for the row to be saved
		await this.page.waitForTimeout(500);

		// Get the workflow ID from the row actions
		const workflowRow = this.page.locator(`table tbody tr:has-text("${name}")`);
		await workflowRow.waitFor({ state: 'visible' });

		// Click "Build" to go to the builder and extract the ID from URL
		const buildButton = workflowRow.locator('button:has-text("Build")');
		await buildButton.click();

		// Wait for builder page
		await this.page.waitForURL('**/workflows/**/builder');
		const url = this.page.url();
		const match = url.match(/\/workflows\/([^/]+)\/builder/);
		if (!match) {
			throw new Error('Could not extract workflow ID from URL: ' + url);
		}
		return match[1];
	}

	async getWorkflowNames(): Promise<string[]> {
		const nameCells = this.page.locator('table tbody tr td:first-child');
		const count = await nameCells.count();
		const names: string[] = [];
		for (let i = 0; i < count; i++) {
			const text = await nameCells.nth(i).textContent();
			if (text && !text.includes('No workflows')) {
				names.push(text.trim());
			}
		}
		return names;
	}

	async workflowExists(name: string): Promise<boolean> {
		const names = await this.getWorkflowNames();
		return names.includes(name);
	}

	async openBuilder(workflowName: string) {
		const row = this.page.locator(`table tbody tr:has-text("${workflowName}")`);
		const buildButton = row.locator('button:has-text("Build")');
		await buildButton.click();
		await this.page.waitForURL('**/workflows/**/builder');
	}
}
