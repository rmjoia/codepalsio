import type { UserRepository, UserRecord } from './users';

/**
 * In-memory UserRepository for tests. Behaves like a tiny key-value store
 * keyed on UserRecord.id. Cheap to construct fresh in beforeEach so tests
 * don't share state.
 */
export class FakeUserRepository implements UserRepository {
	public store = new Map<string, UserRecord>();

	async findByGithubUsername(username: string): Promise<UserRecord | null> {
		const id = `gh-${username.trim().toLowerCase()}`;
		const direct = this.store.get(id);
		// Mirror the production CosmosUserRepository: point-read on
		// `gh-<username>`. A doc whose githubUsername field matches but
		// whose id is something else (legacy/old-shape) is INVISIBLE here,
		// just like in Cosmos.
		return direct ? { ...direct } : null;
	}

	async findByGithubUsernameAcrossShapes(username: string): Promise<UserRecord | null> {
		// Fast path mirrors production: point-read first.
		const fresh = await this.findByGithubUsername(username);
		if (fresh) return fresh;

		// Fallback: scan for legacy docs (non-gh- id) whose githubUsername
		// field matches case-insensitively.
		const wanted = username.trim().toLowerCase();
		const legacy = [...this.store.values()]
			.filter((r) => !r.id.startsWith('gh-') && (r.githubUsername ?? '').toLowerCase() === wanted)
			.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
		return legacy[0] ? { ...legacy[0] } : null;
	}

	async upsert(record: UserRecord): Promise<UserRecord> {
		this.store.set(record.id, { ...record });
		return { ...record };
	}

	async deleteById(id: string): Promise<void> {
		// Idempotent — Map.delete returns false on missing key, no throw.
		this.store.delete(id);
	}

	async listByRole(role: string): Promise<UserRecord[]> {
		return [...this.store.values()].filter((r) => r.roles?.includes(role)).map((r) => ({ ...r }));
	}

	async countByRole(role: string): Promise<number> {
		return [...this.store.values()].filter((r) => r.roles?.includes(role)).length;
	}
}
