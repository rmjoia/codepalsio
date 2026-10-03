import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static regression gate for the suspension enforcement layer (spec 003
 * FR-124b).
 *
 * On SWA Free there's no `rolesSource`, so suspension can't flip at the
 * route gate. The enforcement contract is instead:
 *
 *   Every handler that is reachable by authenticated users MUST call
 *   `assertNotSuspended` before doing any user-visible work.
 *
 * A new handler that forgets to call it would silently let suspended
 * users act — the kind of bug a reviewer easily misses amid a
 * CRUD-shaped diff. This test fails CI the moment that happens.
 *
 * Scope: handlers that are reachable by authenticated users. Handlers
 * registered only for anonymous callers (none at time of writing) and
 * static-only pages don't need the guard. The allow-list below encodes
 * the "intentionally not gated" set; everything else must have the
 * guard.
 */

const API_SRC = new URL('../', import.meta.url).pathname;

/**
 * Files that intentionally don't call assertNotSuspended. Add to this
 * list only after thinking through WHY it's safe — a 1-line comment on
 * the entry justifies the exception for the next reader.
 */
const INTENTIONALLY_UNGATED: Record<string, string> = {
	// index.ts aggregates registrations but has no handler of its own.
	'index.ts': 'module aggregator — no handler logic',
};

type Handler = { file: string; funcName: string };

function collectAuthenticatedHandlers(): Handler[] {
	const handlers: Handler[] = [];
	// Match `app.http('<name>', { ... })` registrations. The handler name
	// isn't what we assert on; we just use the registration as evidence
	// that this file ships a Functions handler.
	const appHttpRe = /\bapp\.http\(\s*['"]([^'"]+)['"]/;

	for (const entry of readdirSync(API_SRC, { withFileTypes: true })) {
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith('.ts')) continue;
		if (entry.name.endsWith('.test.ts')) continue;
		if (entry.name.endsWith('.fake.ts')) continue;
		if (INTENTIONALLY_UNGATED[entry.name]) continue;

		const path = join(API_SRC, entry.name);
		const content = readFileSync(path, 'utf8');
		const match = content.match(appHttpRe);
		if (!match) continue;
		handlers.push({ file: entry.name, funcName: match[1] });
	}
	return handlers;
}

describe('suspension enforcement — every authenticated handler is gated', () => {
	const handlers = collectAuthenticatedHandlers();

	it('discovers at least one handler (sanity)', () => {
		// If this fails, the regex isn't matching anything and every
		// other test trivially passes. Catch that here.
		expect(handlers.length, 'expected to discover handler files').toBeGreaterThan(5);
	});

	it.each(handlers)(
		'$file calls assertNotSuspended',
		({ file }) => {
			const path = join(API_SRC, file);
			const content = readFileSync(path, 'utf8');

			// Two signals, both required: the import AND a call. The
			// import alone could be a dead import; the call alone could
			// come from a differently-named local function. Together they
			// prove the handler is wired to the enforcement helper.
			const hasImport = /from\s+['"]\.\/lib\/suspension['"]/.test(content)
				|| /from\s+['"]\.\.\/lib\/suspension['"]/.test(content);
			const hasCall = /\bassertNotSuspended\s*\(/.test(content);

			expect(
				hasImport,
				`${file} is a handler registered via app.http but does not import ` +
					`assertNotSuspended from ./lib/suspension. Every authenticated ` +
					`handler must gate on suspension — see api/src/lib/suspension.ts. ` +
					`If this handler is intentionally ungated, add it to ` +
					`INTENTIONALLY_UNGATED in this test with a one-line justification.`
			).toBe(true);

			expect(
				hasCall,
				`${file} imports assertNotSuspended but never calls it. The import ` +
					`is dead and the handler is NOT gating on suspension.`
			).toBe(true);
		}
	);
});
