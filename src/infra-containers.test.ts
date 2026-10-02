import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Infrastructure invariants: Cosmos container declarations in Bicep.
 *
 * Spec 003 moderation (reports + audit) and spec 005 messaging (messages)
 * depend on specific containers existing with specific partition-key paths.
 * A silent rename in `infra/main.bicep`, or a drift to the wrong partition
 * key, would break the handlers at runtime after the next
 * `Initialize-Infra.ps1` apply — potentially after a deploy.
 *
 * These tests parse the Bicep file as text and assert each required
 * container is declared with the correct `id` and partition key. They
 * can't catch a dangling or malformed resource (that's what `bicep build`
 * does in the deploy pipeline), but they do catch "someone renamed the
 * container and forgot to update the handler" — the most common drift.
 */
const bicepPath = resolve(__dirname, '../infra/main.bicep');
const bicep = readFileSync(bicepPath, 'utf8');

/**
 * Extract the properties.resource block for a named container. Returns
 * the raw text between the `name: '<name>'` line and the matching closing
 * brace. Not a real Bicep parser — just enough to assert on specific
 * fields inside a container declaration.
 */
function containerBlock(name: string): string {
	const start = bicep.indexOf(`name: '${name}'`);
	if (start === -1) return '';
	// Walk forward to the end of this container's declaration — simplest
	// heuristic: next container declaration OR the "Cosmos DB data plane
	// RBAC" sentinel comment.
	const nextStart = bicep.indexOf('resource ', bicep.indexOf('properties: {', start) + 1);
	const roleSentinel = bicep.indexOf('// Cosmos DB data plane RBAC', start);
	const end = Math.min(
		nextStart > -1 ? nextStart : Infinity,
		roleSentinel > -1 ? roleSentinel : Infinity
	);
	return bicep.slice(start, end === Infinity ? undefined : end);
}

describe('infra/main.bicep — Cosmos container declarations', () => {
	describe('reports container (spec 003 FR-111)', () => {
		it('is declared', () => {
			expect(bicep).toMatch(/name:\s*'reports'/);
		});

		it('uses /reportedProfileId as its partition key', () => {
			// Picked for query pattern "all reports for profile X" (the
			// moderation queue's primary read). A drift to /id or
			// /reporterId would silently break cross-partition queries
			// on the moderation page.
			const block = containerBlock('reports');
			expect(block).toContain('/reportedProfileId');
			// Negative: pin that it ISN'T partitioned by any other field
			// a future refactor might reach for.
			expect(block).not.toMatch(/paths:\s*\[\s*['"]\/id['"]/);
			expect(block).not.toMatch(/paths:\s*\[\s*['"]\/reporterId['"]/);
		});
	});

	describe('audit container (spec 003 FR-122)', () => {
		it('is declared', () => {
			expect(bicep).toMatch(/name:\s*'audit'/);
		});

		it('uses /adminId as its partition key', () => {
			// Picked for "show me all actions by moderator X" — the
			// natural admin-accountability read. If this drifts the
			// audit log becomes expensive to query by moderator.
			const block = containerBlock('audit');
			expect(block).toContain('/adminId');
		});
	});

	describe('existing containers stay stable', () => {
		// Regression guard: adding reports + audit should NOT change
		// users/profiles/connections. Pin their names + partition keys so
		// a careless refactor fails this test.
		it.each([
			['users', '/id'],
			['profiles', '/userId'],
			['connections', '/userId1'],
		])('%s container partitions by %s', (name, pk) => {
			const block = containerBlock(name);
			expect(block, `container '${name}' must be declared`).not.toBe('');
			expect(block).toContain(pk);
		});
	});
});
