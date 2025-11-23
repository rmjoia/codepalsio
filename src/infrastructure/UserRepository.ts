import { CosmosClient, type Container } from '@azure/cosmos';
import { User } from '../domain/User';

/**
 * Repository for User persistence in Cosmos DB
 * Handles all database operations for User entities
 */
export class UserRepository {
	private container: Container;

	constructor(
		private connectionString: string,
		private databaseName: string
	) {
		const client = new CosmosClient(connectionString);
		this.container = client.database(databaseName).container('users');
	}

	/**
	 * Find user by GitHub ID
	 */
	async findByGithubId(githubId: string): Promise<User | null> {
		const querySpec = {
			query: 'SELECT * FROM c WHERE c.githubId = @githubId',
			parameters: [{ name: '@githubId', value: githubId }],
		};

		const { resources } = await this.container.items.query(querySpec).fetchAll();

		if (resources.length === 0) {
			return null;
		}

		return User.fromJSON(resources[0]);
	}

	/**
	 * Find user by ID
	 */
	async findById(id: string): Promise<User | null> {
		try {
			const { resource } = await this.container.item(id, id).read();
			if (!resource) return null;
			return User.fromJSON(resource);
		} catch (error: unknown) {
			if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
				return null;
			}
			throw error;
		}
	}

	/**
	 * Create new user
	 */
	async create(user: User): Promise<User> {
		const data = user.toJSON();
		await this.container.items.create(data);
		return user;
	}

	/**
	 * Update existing user
	 */
	async update(user: User): Promise<User> {
		const data = user.toJSON();
		await this.container.item(user.id, user.id).replace(data);
		return user;
	}

	/**
	 * Delete user
	 */
	async delete(id: string): Promise<void> {
		await this.container.item(id, id).delete();
	}
}
