import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static checks on every `app.http(NAME, ...)` registration in the API
 * source tree. Runs at unit-test time — fails CI on a new registration
 * that violates the rules. Cheap; no network, no Cosmos.
 *
 * Rules enforced:
 *
 *   1. NAME MUST NOT start with a reserved Azure Functions prefix.
 *      `admin` / `admins` / `host` / `functions` / `keys` / `extensions`
 *      collide with the Functions host management namespace; SWA routes
 *      `/api/<name>` to a 404 from the reserved-path handler instead of
 *      calling the function. See `.specify/platform-constraints.md` for
 *      the discovery story.
 *
 *   2. NAME MUST NOT start with an underscore. Reserved for system
 *      functions.
 *
 *   3. NAME MUST be unique across the source tree. Duplicate
 *      registrations silently shadow each other.
 *
 * If a new constraint is learned, add it here AND document it in
 * platform-constraints.md.
 */

const RESERVED_PREFIXES = ['admin', 'admins', 'host', 'functions', 'keys', 'extensions'];

const API_SRC = new URL('../', import.meta.url).pathname;

function collectAppHttpRegistrations(): Array<{ name: string; file: string }> {
	const registrations: Array<{ name: string; file: string }> = [];
	// Match `app.http('<name>',` or `app.http("<name>",`. The name MUST be
	// a literal string — dynamic names are forbidden by convention so
	// this static check can see them all.
	const re = /\bapp\.http\(\s*(['"])([^'"]+)\1\s*,/g;

	for (const entry of readdirSync(API_SRC, { withFileTypes: true })) {
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith('.ts')) continue;
		if (entry.name.endsWith('.test.ts')) continue;
		if (entry.name.endsWith('.fake.ts')) continue;
		if (entry.name === 'index.ts') continue;

		const path = join(API_SRC, entry.name);
		const content = readFileSync(path, 'utf8');
		for (const match of content.matchAll(re)) {
			registrations.push({ name: match[2], file: entry.name });
		}
	}
	return registrations;
}

describe('function registrations — static invariants', () => {
	const registrations = collectAppHttpRegistrations();

	it('discovers at least one registration (sanity)', () => {
		// If this fails, the regex isn't matching — every other test
		// trivially passes and the gate is dead. Catch that here.
		expect(registrations.length, 'expected to discover app.http() calls').toBeGreaterThan(0);
	});

	it.each(RESERVED_PREFIXES)(
		"no function name starts with reserved prefix '%s' (Azure Functions host conflict)",
		(prefix) => {
			const offenders = registrations.filter((r) => {
				const name = r.name.toLowerCase();
				// "starts with prefix" means name === prefix OR name starts
				// with prefix followed by '-', '_', or end-of-string. Avoid
				// false positives on e.g. 'administer' vs 'admin' (unlikely
				// but be precise).
				return (
					name === prefix ||
					name.startsWith(`${prefix}-`) ||
					name.startsWith(`${prefix}_`)
				);
			});
			expect(
				offenders,
				`Reserved prefix '${prefix}' detected in:\n` +
					offenders.map((o) => `  - ${o.file} → app.http('${o.name}', …)`).join('\n') +
					`\n\nAzure Functions reserves this prefix for its host management API.\n` +
					`Rename the function to something else.\n` +
					`See .specify/platform-constraints.md for the full story.`
			).toEqual([]);
		}
	);

	it('no function name starts with underscore (reserved for system functions)', () => {
		const offenders = registrations.filter((r) => r.name.startsWith('_'));
		expect(offenders, `Underscore-prefixed names detected: ${JSON.stringify(offenders)}`).toEqual(
			[]
		);
	});

	it('function names are unique across the source tree', () => {
		const seen = new Map<string, string[]>();
		for (const r of registrations) {
			const existing = seen.get(r.name);
			if (existing) {
				existing.push(r.file);
			} else {
				seen.set(r.name, [r.file]);
			}
		}
		const duplicates = [...seen.entries()].filter(([, files]) => files.length > 1);
		expect(
			duplicates,
			`Duplicate registrations:\n` +
				duplicates.map(([name, files]) => `  ${name}: ${files.join(', ')}`).join('\n')
		).toEqual([]);
	});

	it('function names are lowercase kebab-case (URL-safe, convention)', () => {
		const re = /^[a-z][a-z0-9-]*$/;
		const offenders = registrations.filter((r) => !re.test(r.name));
		expect(
			offenders,
			`Names not matching /^[a-z][a-z0-9-]*$/:\n` +
				offenders.map((o) => `  - ${o.file} → '${o.name}'`).join('\n')
		).toEqual([]);
	});
});
