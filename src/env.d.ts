/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
	readonly AZURE_KEYVAULT_URL?: string;
	readonly KEY_VAULT_URI?: string;
	readonly MANAGED_IDENTITY_CLIENT_ID?: string;
	readonly COSMOS_DB_CONNECTION_STRING: string;
	readonly COSMOS_DB_DATABASE_NAME: string;
	readonly GITHUB_CLIENT_ID: string;
	readonly GITHUB_CLIENT_SECRET: string;
	readonly JWT_SECRET: string;
	readonly ENVIRONMENT: string;
	readonly CODEPALS_SENDGRID_DEV_KEY: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
