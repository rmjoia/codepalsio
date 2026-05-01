import type { Container } from '@azure/cosmos';
import { getContainer } from './cosmos';

/**
 * Persisted user record. Stored in the `users` Cosmos container, keyed
 * by `id = 'gh-<lowercased-github-username>'`. Lookups happen by GitHub
 * username (always known at login), so a deterministic id keeps every
 * read a point-read regardless of whether the user has logged in yet.
 *
 * `swaUserId` is the SWA-hashed principal id; populated on first login
 * (by the rolesSource handler) and used elsewhere for cross-referencing
 * profile docs. It's optional because admins can be granted before the
 * grantee logs in for the first time.
 */
export interface UserRecord {
	id: string;
	githubUsername: string;
	swaUserId?: string;
	roles: string[];
	/** id of the granter (their UserRecord.id), or 'bootstrap' for env-var seed */
	grantedBy?: string;
	grantedAt?: string;
	updatedAt: string;
}

/** Deterministic Cosmos id for a GitHub user. Lowercased so case
 * differences between OAuth payload and admin-grant input don't create
 * duplicate documents. */
export function userIdForGithub(githubUsername: string): string {
	return `gh-${githubUsername.trim().toLowerCase()}`;
}

/**
 * Repository abstraction for user records. Handlers depend on this
 * interface, not the Cosmos implementation, so tests can inject an
 * in-memory fake (see users.fake.ts) and we can swap the backend later
 * without touching handler code (DIP).
 */
export interface UserRepository {
	findByGithubUsername(githubUsername: string): Promise<UserRecord | null>;
	upsert(record: UserRecord): Promise<UserRecord>;
	listByRole(role: string): Promise<UserRecord[]>;
	countByRole(role: string): Promise<number>;
}

class CosmosUserRepository implements UserRepository {
	private readonly container: Container;
	constructor(connectionString: string, database: string) {
		this.container = getContainer(connectionString, database, 'users');
	}

	async findByGithubUsername(githubUsername: string): Promise<UserRecord | null> {
		const id = userIdForGithub(githubUsername);
		try {
			const { resource } = await this.container.item(id, id).read<UserRecord>();
			return resource ?? null;
		} catch (e: unknown) {
			if (isNotFound(e)) return null;
			throw e;
		}
	}

	async upsert(record: UserRecord): Promise<UserRecord> {
		const { resource } = await this.container.items.upsert<UserRecord>(record);
		// Cosmos returns the persisted resource; fall back to the input on the
		// off-chance it's omitted (shouldn't happen with the SDK, but be safe).
		return (resource as UserRecord | undefined) ?? record;
	}

	async listByRole(role: string): Promise<UserRecord[]> {
		const { resources } = await this.container.items
			.query<UserRecord>({
				query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(c.roles, @role)',
				parameters: [{ name: '@role', value: role }],
			})
			.fetchAll();
		return resources;
	}

	async countByRole(role: string): Promise<number> {
		const { resources } = await this.container.items
			.query<number>({
				query: 'SELECT VALUE COUNT(1) FROM c WHERE ARRAY_CONTAINS(c.roles, @role)',
				parameters: [{ name: '@role', value: role }],
			})
			.fetchAll();
		return resources[0] ?? 0;
	}
}

function isNotFound(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: unknown }).code === 404
	);
}

export function createUserRepository(connectionString: string, database: string): UserRepository {
	return new CosmosUserRepository(connectionString, database);
}
