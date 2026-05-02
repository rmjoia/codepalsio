import {
	type AdminRoster,
	type AdminRosterRepository,
	ROSTER_ID,
	RosterStaleError,
} from './admin-roster';

/**
 * In-memory roster with simulated Cosmos etag semantics.
 *
 * - `read()` returns a deep copy with the current etag.
 * - `write(roster)`:
 *     - if `roster._etag` is undefined → unconditional write (initial seed)
 *     - if `roster._etag` matches the stored etag → write succeeds, etag bumps
 *     - else → throws RosterStaleError (mirrors Cosmos 412)
 *
 * `simulateContentionOnce()` lets a test inject a single etag bump
 * between a caller's read and write to exercise the retry loop.
 */
export class FakeAdminRosterRepository implements AdminRosterRepository {
	public stored: AdminRoster | null = null;
	public writes = 0;
	private etagCounter = 0;
	private contentionPending = 0;

	async read(): Promise<AdminRoster | null> {
		if (!this.stored) return null;
		return { ...this.stored, admins: [...this.stored.admins] };
	}

	async write(roster: AdminRoster): Promise<AdminRoster> {
		this.writes++;

		// Simulated concurrent writer: bump the stored etag so this caller's
		// IfMatch fails. Mirrors the Cosmos race we're trying to defeat.
		if (this.contentionPending > 0 && this.stored) {
			this.contentionPending--;
			this.etagCounter++;
			this.stored = { ...this.stored, _etag: `etag-${this.etagCounter}` };
		}

		if (this.stored && roster._etag !== undefined) {
			if (roster._etag !== this.stored._etag) {
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
