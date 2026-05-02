import type { UserRepository, UserRecord } from './users';

/**
 * In-memory UserRepository for tests. Behaves like a tiny key-value store
 * keyed on UserRecord.id. Cheap to construct fresh in beforeEach so tests
 * don't share state.
 */
export class FakeUserRepository implements UserRepository {
	public store = new Map<string, UserRecord>();

	async findByGithubUsername(username: string): Promise<UserRecord | null> {
		const wanted = username.toLowerCase();
		for (const r of this.store.values()) {
			if (r.githubUsername.toLowerCase() === wanted) return { ...r };
		}
		return null;
	}

	async upsert(record: UserRecord): Promise<UserRecord> {
		this.store.set(record.id, { ...record });
		return { ...record };
	}

	async listByRole(role: string): Promise<UserRecord[]> {
		return [...this.store.values()].filter((r) => r.roles?.includes(role)).map((r) => ({ ...r }));
	}

	async countByRole(role: string): Promise<number> {
		return [...this.store.values()].filter((r) => r.roles?.includes(role)).length;
	}
}
