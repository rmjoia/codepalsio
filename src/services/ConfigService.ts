import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

/**
 * Configuration service that loads secrets from Azure Key Vault
 * Falls back to environment variables for local development
 */
export class ConfigService {
	private static instance: ConfigService;
	private secretsCache = new Map<string, string>();
	private keyVaultUrl?: string;
	private secretClient?: SecretClient;
	private useKeyVault: boolean;

	private constructor() {
		// Determine if we should use Key Vault (production/Azure) or env vars (local dev)
		this.keyVaultUrl = process.env.AZURE_KEYVAULT_URL || process.env.KEY_VAULT_URI;
		this.useKeyVault = !!this.keyVaultUrl && process.env.ENVIRONMENT !== 'dev';

		if (this.useKeyVault && this.keyVaultUrl) {
			// DefaultAzureCredential tries multiple auth methods in order:
			// 1. Environment variables (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)
			// 2. Managed Identity (in Azure)
			// 3. Azure CLI (if signed in with az login)
			// 4. Azure PowerShell (if signed in with Connect-AzAccount)
			// 5. Interactive browser (VS Code, Azure tools)
			const credential = new DefaultAzureCredential();
			this.secretClient = new SecretClient(this.keyVaultUrl, credential);
			console.log(`[ConfigService] Using Azure Key Vault: ${this.keyVaultUrl}`);
		} else {
			console.log('[ConfigService] Using local environment variables');
		}
	}

	/**
	 * Get singleton instance
	 */
	public static getInstance(): ConfigService {
		if (!ConfigService.instance) {
			ConfigService.instance = new ConfigService();
		}
		return ConfigService.instance;
	}

	/**
	 * Get secret value from Key Vault or environment variables
	 * Azure Key Vault secret names use dashes (GITHUB-CLIENT-ID)
	 * Environment variable names use underscores (GITHUB_CLIENT_ID)
	 */
	async getSecret(name: string): Promise<string> {
		// Check cache first
		if (this.secretsCache.has(name)) {
			const cachedSource = this.useKeyVault ? 'Key Vault (cached)' : 'env vars (cached)';
			console.log(`[ConfigService] Using cached secret: ${name} from ${cachedSource}`);
			return this.secretsCache.get(name)!;
		}

		let value: string | undefined;

		if (this.useKeyVault && this.secretClient) {
			try {
				// Key Vault uses dashes in secret names
				const keyVaultName = name.replace(/_/g, '-');
				console.log(`[ConfigService] Fetching secret from Key Vault: ${keyVaultName}`);
				const secret = await this.secretClient.getSecret(keyVaultName);
				value = secret.value;
				console.log(`[ConfigService] ✅ Successfully loaded from Key Vault: ${keyVaultName}`);
			} catch (error) {
				console.error(`[ConfigService] ❌ Failed to load secret from Key Vault: ${name}`, error);
				// Fall back to environment variable
				console.log(`[ConfigService] Falling back to environment variable: ${name}`);
				value = process.env[name];
			}
		} else {
			// Local development: use environment variables with underscores
			console.log(`[ConfigService] Loading from environment variable: ${name}`);
			value = process.env[name];
		}

		if (!value) {
			throw new Error(`Configuration error: Secret '${name}' not found in ${this.useKeyVault ? 'Key Vault' : 'environment variables'}`);
		}

		// Cache the value
		this.secretsCache.set(name, value);
		return value;
	}

	/**
	 * Load all required secrets at startup
	 */
	async loadAllSecrets(): Promise<{
		githubClientId: string;
		githubClientSecret: string;
		jwtSecret: string;
		cosmosDbConnectionString: string;
		cosmosDbDatabaseName: string;
		sendgridApiKey: string;
	}> {
		const [
			githubClientId,
			githubClientSecret,
			jwtSecret,
			cosmosDbConnectionString,
			cosmosDbDatabaseName,
			sendgridApiKey,
		] = await Promise.all([
			this.getSecret('GITHUB_CLIENT_ID'),
			this.getSecret('GITHUB_CLIENT_SECRET'),
			this.getSecret('JWT_SECRET'),
			this.getSecret('COSMOS_DB_CONNECTION_STRING'),
			this.getSecret('COSMOS_DB_DATABASE_NAME'),
			this.getSecret('CODEPALS_SENDGRID_DEV_KEY'),
		]);

		return {
			githubClientId,
			githubClientSecret,
			jwtSecret,
			cosmosDbConnectionString,
			cosmosDbDatabaseName,
			sendgridApiKey,
		};
	}

	/**
	 * Clear the secrets cache (useful for testing)
	 */
	clearCache(): void {
		this.secretsCache.clear();
	}
}

/**
 * Singleton instance for easy access
 */
export const config = ConfigService.getInstance();
