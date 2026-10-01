import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workflow = readFileSync(
	resolve(__dirname, '..', '.github', 'workflows', 'azure-static-web-apps.yml'),
	'utf8'
);

const prodDeployBlock = extractJobBlock(workflow, 'prod_deploy');
const e2eProdBlock = extractJobBlock(workflow, 'e2e_prod');

function extractJobBlock(source: string, jobName: string): string {
	const lines = source.split('\n');
	const startIndex = lines.findIndex((line) => line.startsWith(`  ${jobName}:`));
	if (startIndex === -1) return '';
	const end = lines.findIndex((line, index) => index > startIndex && /^ {2}[A-Za-z_]/.test(line));
	return lines.slice(startIndex, end === -1 ? lines.length : end).join('\n');
}

describe('prod_deploy workflow gate (issue #74)', () => {
	it('declares a prod_deploy job', () => {
		expect(prodDeployBlock).not.toBe('');
	});

	it('gates prod_deploy behind the validate job', () => {
		expect(prodDeployBlock).toMatch(/needs:\s*validate/);
	});

	it('restricts prod_deploy to pushes on the main branch', () => {
		expect(prodDeployBlock).toContain("github.ref == 'refs/heads/main'");
		expect(prodDeployBlock).toContain("github.event_name == 'push'");
	});

	it('binds prod_deploy to the `production` GitHub Environment for manual approval', () => {
		expect(prodDeployBlock).toMatch(/environment:\s*\n\s*name:\s*production/);
		expect(prodDeployBlock).toContain('url: https://codepals.io');
	});

	it('uses the prod-specific deploy token secret', () => {
		expect(prodDeployBlock).toContain('AZURE_STATIC_WEB_APPS_API_TOKEN_PROD');
		expect(prodDeployBlock).not.toMatch(/AZURE_STATIC_WEB_APPS_API_TOKEN(?!_PROD)/);
	});

	it('declares an e2e_prod job that depends on prod_deploy', () => {
		expect(e2eProdBlock).not.toBe('');
		expect(e2eProdBlock).toMatch(/needs:\s*prod_deploy/);
	});

	it('runs the prod E2E suite against https://codepals.io', () => {
		expect(e2eProdBlock).toContain('E2E_BASE_URL: https://codepals.io');
		expect(e2eProdBlock).not.toContain('https://dev.codepals.io');
	});
});
