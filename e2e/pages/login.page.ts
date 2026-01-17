import { type Page, expect } from '@playwright/test';

export class LoginPage {
	constructor(private page: Page) {}

	// Selectors
	private emailInput = '#email';
	private passwordInput = '#password';
	private submitButton = 'button[type="submit"]';

	async goto() {
		await this.page.goto('/login');
		await this.page.waitForSelector(this.emailInput);
	}

	async login(email: string, password: string) {
		await this.page.fill(this.emailInput, email);
		await this.page.fill(this.passwordInput, password);
		await this.page.click(this.submitButton);
	}

	async waitForDashboard() {
		// After login, we should be redirected to /projects
		await this.page.waitForURL('**/projects', { timeout: 15000 });
		await expect(this.page.locator('h1')).toContainText('Projects');
	}

	async loginAndWaitForDashboard(email: string, password: string) {
		await this.goto();
		await this.login(email, password);
		await this.waitForDashboard();
	}
}
