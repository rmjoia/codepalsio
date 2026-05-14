#!/usr/bin/env node
/**
 * Post-build guard: fail if any built HTML page contains an inline
 * `<script>` block. Astro normally bundles `<script>` blocks as external
 * files, but a small-enough compiled script can be inlined as
 * `<script type="module">...</script>` — which our CSP (`script-src 'self'`,
 * no `'unsafe-inline'`) will block, breaking the page.
 *
 * Runs after `astro build` so it sees the actual deployed HTML, not the
 * source. Exits non-zero on violation so CI fails.
 *
 * Allowed: `<script src="...">` (external reference, CSP-compliant)
 * Blocked: any `<script>...</script>` with non-empty inline content
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../dist', import.meta.url).pathname;
const violations = [];

// Match opening <script> that's NOT self-closing and NOT a `<script src="...">`
// reference. The body capture is non-greedy and tolerates type="module".
// We then check the body is non-empty (just whitespace is OK — Astro sometimes
// emits `<script ...></script>` placeholders).
const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

function walk(dir) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			walk(full);
		} else if (entry.endsWith('.html')) {
			scanFile(full);
		}
	}
}

function scanFile(file) {
	const html = readFileSync(file, 'utf8');
	for (const match of html.matchAll(INLINE_SCRIPT_RE)) {
		const body = match[1].trim();
		if (body.length === 0) continue; // empty `<script></script>` is harmless
		const preview = body.length > 120 ? body.slice(0, 117) + '...' : body;
		violations.push({
			file: relative(process.cwd(), file),
			snippet: preview,
		});
	}
}

walk(ROOT);

if (violations.length > 0) {
	console.error('\n❌ Inline <script> blocks found in built HTML — these will be blocked by CSP `script-src \'self\'`:\n');
	for (const v of violations) {
		console.error(`  ${v.file}`);
		console.error(`    body: ${v.snippet}\n`);
	}
	console.error('Fix: move the script into a larger Astro <script> block (so the bundle exceeds Astro\'s inlining threshold), or import its logic from a module that\'s already bundled externally. See src/components/Header.astro for the current pattern.\n');
	process.exit(1);
}

console.log('✓ No inline scripts in built HTML (CSP-safe).');
