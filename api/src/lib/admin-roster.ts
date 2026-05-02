import type { Container } from '@azure/cosmos';
import { getContainer } from './cosmos';
import { type UserRepository, userIdForGithub } from './users';

/**
 * Single document holding the canonical list of admin user ids.
 *
 * Lives in the same `users` container (id = 'roster'). Existing
 * ARRAY_CONTAINS(roles, ...) queries naturally exclude it because it
 * has no `roles` field.
 *
 * Why a single doc? It gives us atomic compare-and-swap (Cosmos IfMatch
 * on _etag), which is required to make the last-admin guard race-safe.
 * Without it, `count >= 2` reads + per-record writes could allow two
 * concurrent revokes to both pass the guard and leave zero admins.
 */
export interface AdminRoster {
	id: 'roster';
	/** userIdForGithub() values — stable keys into UserRecord */
	admins: string[];
	updatedAt: string;
	/** Cosmos-managed etag; required for IfMatch on subsequent writes. */
	_etag?: string;
}

export const ROSTER_ID = 'roster' as const;

/**
 * Repository abstraction over the roster doc. `read` returns null when
 * the roster has never been written (fresh deploy); callers should
 * trigger a one-time seed before mutating.
 *
 * `write` requires `_etag` for atomic updates. Pass `_etag: undefined`
 * only for the initial seed (no precondition).
 */
export interface AdminRosterRepository {
	read(): Promise<AdminRoster | null>;
	write(roster: AdminRoster): Promise<AdminRoster>;
}

/**
 * Thrown by mutateRoster after the retry budget is exhausted. Handlers
 * should map this to a 503 — the system is healthy but contended.
 */
export class RosterContendedError extends Error {
	constructor() {
		super('Roster write contended after max retries');
		this.name = 'RosterContendedError';
	}
}

/**
 * Thrown by the Cosmos repo's `write` when the IfMatch precondition
 * fails. Caught and converted to a retry inside mutateRoster.
 */
export class RosterStaleError extends Error {
	constructor() {
		super('Roster etag stale');
		this.name = 'RosterStaleError';
	}
}

class CosmosAdminRosterRepository implements AdminRosterRepository {
	private readonly container: Container;
	constructor(connectionString: string, database: string) {
		this.container = getContainer(connectionString, database, 'users');
	}

	async read(): Promise<AdminRoster | null> {
		try {
			const { resource } = await this.container.item(ROSTER_ID, ROSTER_ID).read<AdminRoster>();
			return resource ?? null;
		} catch (e: unknown) {
			if (isNotFound(e)) return null;
			throw e;
		}
	}

	async write(roster: AdminRoster): Promise<AdminRoster> {
		const accessCondition = roster._etag
			? { type: 'IfMatch' as const, condition: roster._etag }
			: undefined;
		try {
			const { resource } = await this.container.items.upsert<AdminRoster>(roster, {
				accessCondition,
			});
			return (resource as AdminRoster | undefined) ?? roster;
		} catch (e: unknown) {
			if (isPreconditionFailed(e)) throw new RosterStaleError();
			throw e;
		}
	}
}

function isNotFound(err: unknown): boolean {
	return hasCode(err, 404);
}

function isPreconditionFailed(err: unknown): boolean {
	return hasCode(err, 412);
}

function hasCode(err: unknown, code: number): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: unknown }).code === code
	);
}

export function createAdminRosterRepository(
	connectionString: string,
	database: string
): AdminRosterRepository {
	return new CosmosAdminRosterRepository(connectionString, database);
}

/**
 * Read the roster, seeding it from existing admin user records if it
 * doesn't exist yet. Idempotent: if another worker seeded between our
 * read and our write, we'll observe the seeded version on retry.
 *
 * The seed write is unconditional (no IfMatch); concurrent seeders may
 * both write but with identical content, so the result is consistent.
 */
export async function getOrSeedRoster(
	rosterRepo: AdminRosterRepository,
	userRepo: UserRepository,
	now: () => string
): Promise<AdminRoster> {
	const existing = await rosterRepo.read();
	if (existing) return existing;

	// Seed from current admin user records. If none exist, we still
	// write an empty roster so subsequent operations have an etag to
	// pin against.
	const adminRecords = await userRepo.listByRole('admin');
	const seed: AdminRoster = {
		id: ROSTER_ID,
		admins: adminRecords.map((r) => r.id),
		updatedAt: now(),
	};
	return rosterRepo.write(seed);
}

/**
 * Optimistic-concurrency loop around the roster doc.
 *
 * Caller provides a pure mutator that decides one of:
 *   - { next: AdminRoster, result } → commit and return result
 *   - { abort: result } → don't write, return result (e.g. last-admin guard)
 *
 * On Cosmos 412 (etag mismatch) we re-read and re-run the mutator. The
 * mutator MUST be pure (no external side-effects) since it can run
 * multiple times.
 *
 * After `maxAttempts` failed writes we throw RosterContendedError.
 */
export async function mutateRoster<T>(
	rosterRepo: AdminRosterRepository,
	userRepo: UserRepository,
	mutator: (roster: AdminRoster) => { next: AdminRoster; result: T } | { abort: T },
	options: { maxAttempts?: number; now?: () => string } = {}
): Promise<T> {
	const maxAttempts = options.maxAttempts ?? 3;
	const now = options.now ?? (() => new Date().toISOString());

	let lastErr: unknown;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const current = await getOrSeedRoster(rosterRepo, userRepo, now);
		const decision = mutator(current);

		if ('abort' in decision) {
			return decision.abort;
		}

		try {
			await rosterRepo.write({ ...decision.next, updatedAt: now() });
			return decision.result;
		} catch (e: unknown) {
			if (e instanceof RosterStaleError) {
				lastErr = e;
				continue;
			}
			throw e;
		}
	}

	throw lastErr instanceof Error ? new RosterContendedError() : new RosterContendedError();
}
