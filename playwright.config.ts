import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'child_process';

function getLocalIP(): string {
	try {
		const output = execSync("ip a | grep 'inet 192' | awk '{print $2}' | cut -d'/' -f1 | head -1")
			.toString()
			.trim();
		if (output) return output;
	} catch {}
	return 'localhost';
}

const localIP = process.env.PLAYWRIGHT_BASE_IP || getLocalIP();
const baseURL = `https://${localIP}:5173`;

export default defineConfig({
	webServer: {
		command: 'npm run dev',
		url: baseURL,
		reuseExistingServer: true,
		timeout: 120000,
		ignoreHTTPSErrors: true
	},
	testDir: 'e2e',
	timeout: 30000,
	expect: {
		timeout: 5000
	},
	use: {
		baseURL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		ignoreHTTPSErrors: true
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	]
});
