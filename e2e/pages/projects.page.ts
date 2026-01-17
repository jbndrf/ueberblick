import { type Page, expect } from '@playwright/test';

export class ProjectsPage {
	constructor(private page: Page) {}

	// Selectors
	private createProjectButton = 'a[href="/projects/new"]';
	private projectNameInput = '#name';
	private projectDescriptionInput = '#description';
	private projectFormSubmit = 'button[type="submit"]:has-text("Create Project")';
	private projectCards = '[class*="Card"]';

	async goto() {
		await this.page.goto('/projects');
		await this.page.waitForSelector('h1:has-text("Projects")');
	}

	async createProject(name: string, description?: string): Promise<string> {
		// Go to create project page
		await this.page.click(this.createProjectButton);
		await this.page.waitForURL('**/projects/new');
		await this.page.waitForSelector(this.projectNameInput);

		// Fill the form
		await this.page.fill(this.projectNameInput, name);
		if (description) {
			await this.page.fill(this.projectDescriptionInput, description);
		}

		// Submit
		await this.page.click(this.projectFormSubmit);

		// Wait for redirect to participants page and extract projectId from URL
		await this.page.waitForURL('**/projects/**/participants', { timeout: 15000 });
		const url = this.page.url();
		const match = url.match(/\/projects\/([^/]+)\/participants/);
		if (!match) {
			throw new Error('Could not extract project ID from URL: ' + url);
		}
		return match[1];
	}

	async navigateToProject(projectId: string) {
		await this.page.goto(`/projects/${projectId}/participants`);
		await this.page.waitForSelector('h1');
	}

	async getProjectNames(): Promise<string[]> {
		// Find all card titles - they're typically h3 or div with card-title class
		const titles = this.page.locator('h3, [class*="card-title"], [class*="CardTitle"]');
		const count = await titles.count();
		const names: string[] = [];
		for (let i = 0; i < count; i++) {
			const text = await titles.nth(i).textContent();
			if (text) names.push(text.trim());
		}
		return names;
	}

	async projectExists(name: string): Promise<boolean> {
		const names = await this.getProjectNames();
		return names.includes(name);
	}

	async openProject(name: string) {
		// Find the card div that contains the project name, then find the Open Project link within it
		const card = this.page.locator('div').filter({ hasText: name }).filter({ has: this.page.locator('a:has-text("Open Project")') }).first();
		await card.locator('a:has-text("Open Project")').click();
		await this.page.waitForURL('**/projects/**/participants');
	}
}
