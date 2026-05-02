import {
	type AdminRoster,
	type AdminRosterRepository,
	ROSTER_ID,
	RosterStaleError,
} from './admin-roster';

/**
 * In-memory roster with simulated Cosmos etag semantics.
 *
 * Write contract:
 *   - `_etag === undefined` → "create only" (Cosmos IfNoneMatch:*).
 *     If a roster doc already exists, throws RosterStaleError. Used by
 *     getOrSeedRoster so a concurrent seeder can't overwrite a roster
 *     that a different request has already mutated.
 *   - `_etag` set → "compare-and-swap" (Cosmos IfMatch). Mismatch
 *     throws RosterStaleError; match rotates the etag and persists.
 *
 * Test injection hooks:
 *   - simulateContention(N): bump the stored etag on the next N writes
 *     so a caller's IfMatch fails. Use to drive retry paths.
 *   - injectBeforeNextWrite(fn): right before the next write commits,
 *     replace the stored doc with whatever `fn(stored)` returns and
 *     bump the etag. Lets tests simulate a *concurrent mutation* (not
 *     just an etag bump), e.g. another request revoking a different
 *     admin between this caller's read and write — drives the
 *     stale-etag → re-read → re-evaluate path.
 */
export class FakeAdminRosterRepository implements AdminRosterRepository {
	public stored: AdminRoster | null = null;
	public writes = 0;
	private etagCounter = 0;
	private contentionPending = 0;
	private mutationInjection: ((current: AdminRoster | null) => AdminRoster) | null = null;

	async read(): Promise<AdminRoster | null> {
		if (!this.stored) return null;
		return { ...this.stored, admins: [...this.stored.admins] };
	}

	async write(roster: AdminRoster): Promise<AdminRoster> {
		this.writes++;

		// Simulated concurrent writer: replace the stored doc with the
		// injection's output. Fires whether `stored` is null or not so
		// tests can model BOTH "another writer mutated the existing
		// roster" AND "another writer seeded a roster that didn't exist
		// when we read it" (the fresh-deploy race).
		if (this.mutationInjection) {
			const replacement = this.mutationInjection(this.stored);
			this.mutationInjection = null;
			this.etagCounter++;
			this.stored = {
				...replacement,
				_etag: `etag-${this.etagCounter}`,
			};
		}

		// Simulated concurrent writer (etag-only bump). Mirrors the cheaper
		// "etag advanced, contents same" scenario.
		if (this.contentionPending > 0 && this.stored) {
			this.contentionPending--;
			this.etagCounter++;
			this.stored = { ...this.stored, _etag: `etag-${this.etagCounter}` };
		}

		// "Create-only" semantic — caller is asserting the doc doesn't exist.
		// If it does, fail (mirrors Cosmos IfNoneMatch:* → 412).
		if (roster._etag === undefined && this.stored) {
			throw new RosterStaleError();
		}

		// CAS — caller is asserting they read this exact etag.
		if (roster._etag !== undefined) {
			if (!this.stored || roster._etag !== this.stored._etag) {
				throw new RosterStaleError();
			}
		}

		this.etagCounter++;
		const persisted: AdminRoster = {
			id: ROSTER_ID,
			admins: [...roster.admins],
			updatedAt: roster.updatedAt,
			_etag: `etag-${this.etagCounter}`,
		};
		this.stored = persisted;
		return { ...persisted, admins: [...persisted.admins] };
	}

	/**
	 * Inject N synthetic etag bumps that fire on the next N writes,
	 * simulating concurrent writers stealing the etag between this
	 * caller's read and write. Drives the retry path.
	 */
	simulateContention(times: number): void {
		this.contentionPending = times;
	}

	/**
	 * Replace the stored roster with `fn(current)` right before the next
	 * write commits. `current` is null if no roster has been written yet
	 * — useful for modeling a concurrent seeder on a fresh deploy.
	 *
	 * Otherwise simulates a concurrent mutation that invalidates the
	 * etag AND changes the admin set, forcing the retrying caller to
	 * re-evaluate against new state.
	 */
	injectBeforeNextWrite(fn: (current: AdminRoster | null) => AdminRoster): void {
		this.mutationInjection = fn;
	}

	/** Pre-seed the roster directly (skips the seed-from-userRepo path). */
	seed(admins: string[], updatedAt = '2026-01-01T00:00:00Z'): void {
		this.etagCounter++;
		this.stored = {
			id: ROSTER_ID,
			admins: [...admins],
			updatedAt,
			_etag: `etag-${this.etagCounter}`,
		};
	}
}
