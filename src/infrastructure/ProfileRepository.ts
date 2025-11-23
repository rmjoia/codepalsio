import { CosmosClient, type Container } from '@azure/cosmos';
import { Profile } from '../domain/Profile';

/**
 * Repository for Profile persistence in Cosmos DB
 */
export class ProfileRepository {
	private container: Container;

	constructor(
		private connectionString: string,
		private databaseName: string
	) {
		const client = new CosmosClient(connectionString);
		this.container = client.database(databaseName).container('profiles');
	}

	/**
	 * Find profile by user ID
	 */
	async findByUserId(userId: string): Promise<Profile | null> {
		const querySpec = {
			query: 'SELECT * FROM c WHERE c.userId = @userId',
			parameters: [{ name: '@userId', value: userId }],
		};

		const { resources } = await this.container.items.query(querySpec).fetchAll();

		if (resources.length === 0) {
			return null;
		}

		return Profile.fromJSON(resources[0]);
	}

	/**
	 * Create new profile
	 */
	async create(profile: Profile): Promise<Profile> {
		const data = profile.toJSON();
		await this.container.items.create(data);
		return profile;
	}

	/**
	 * Update existing profile
	 */
	async update(profile: Profile): Promise<Profile> {
		const data = profile.toJSON();
		await this.container.item(profile.id, profile.id).replace(data);
		return profile;
	}

	/**
	 * Create or update profile
	 */
	async upsert(profile: Profile): Promise<Profile> {
		const data = profile.toJSON();
		await this.container.items.upsert(data);
		return profile;
	}
}
