@description('Azure region to deploy resources into. Keep this aligned with the PowerShell scripts and docs (westeurope).')
param location string = 'westeurope'

@description('Environment name; must match the RG suffix.')
@allowed([
  'dev'
  'prod'
])
param environment string = 'dev'

@description('GitHub repo in owner/name form. Reserved for future federated-credential wiring.')
param githubRepo string = 'rmjoia/codepalsio'

@description('Object ID of the human operator running the deployment. Granted full secret management on Key Vault so the post-deploy scripts can store tokens. Leave empty in CI / headless runs — the corresponding access policy entry is omitted when empty.')
param currentUserObjectId string = ''

@description('Public IP of the operator running the deploy, in CIDR or single-IP form. Added to the Key Vault firewall allowlist so the post-deploy PowerShell can write secrets. Leave empty in headless CI — the firewall then relies solely on AzureServices bypass. Detect with: (Invoke-RestMethod https://api.ipify.org).Trim()')
param operatorPublicIp string = ''

@description('Comma-separated GitHub logins to seed as admins on first sign-in. Wired into the SWA app setting `ADMIN_GITHUB_LOGINS` and read by the `/api/get-roles` rolesSource handler bootstrap path. Once a user logs in, the AdminRoster (Cosmos) takes over and this env var stops driving their role — leaving it set is harmless. Default: `rmjoia` on dev, empty on prod (override via params file when ready to seed prod admins).')
param adminGithubLogins string = environment == 'dev' ? 'rmjoia' : ''

var project = 'codepals'
var staticWebAppName = '${project}-${environment}'
var keyVaultName = '${project}-${environment}-kv'
var managedIdentityName = '${project}-${environment}-mi'
var cosmosDbAccountName = '${project}-${environment}-cosmos'
var cosmosDbDatabaseName = 'codepals-db'
var domain = environment == 'dev' ? 'dev.codepals.io' : 'codepals.io'
var tags = {
  project: project
  environment: environment
  managed: 'bicep'
}

// User-assigned managed identity — attached to the SWA so it can read KV
// secrets, and granted Cosmos DB Data Contributor for data-plane access.
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
  tags: tags
}

// Build the Key Vault access policy list conditionally — the operator entry
// is only included when currentUserObjectId is resolvable. (Copilot C2)
var managedIdentityAccessPolicy = {
  tenantId: subscription().tenantId
  objectId: managedIdentity.properties.principalId
  permissions: {
    secrets: [
      'get'
      'list'
    ]
  }
}
var operatorAccessPolicy = {
  tenantId: subscription().tenantId
  objectId: currentUserObjectId
  permissions: {
    secrets: [
      'backup'
      'delete'
      'get'
      'list'
      'purge'
      'recover'
      'restore'
      'set'
    ]
  }
}
var keyVaultAccessPolicies = empty(currentUserObjectId) ? [ managedIdentityAccessPolicy ] : [ managedIdentityAccessPolicy, operatorAccessPolicy ]

// Key Vault. Public network surface is restricted:
//   - defaultAction: Deny — the internet can't reach KV by default
//   - bypass: AzureServices — trusted Azure services (App Config, ARM, etc.)
//     and managed identities from the same tenant can still talk to KV
//   - ipRules — the operator's public IP is allowlisted for the duration
//     of the deploy so Set-AzKeyVaultSecret works from their machine
// publicNetworkAccess stays 'Enabled' because that's the only state where
// networkAcls firewall rules actually apply; flipping to 'Disabled' would
// require a Private Endpoint (not set up here).
var keyVaultIpRules = empty(operatorPublicIp) ? [] : [ { value: operatorPublicIp } ]

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    accessPolicies: keyVaultAccessPolicies
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      ipRules: keyVaultIpRules
      virtualNetworkRules: []
    }
  }
}

// Static Web App. The deploy pipeline is owned by the repo-level GitHub
// Actions workflow (.github/workflows/azure-static-web-apps.yml); we don't
// set repositoryUrl/branch here, which would have caused Azure to generate
// a second workflow on first deploy and overwrite the hand-written one.
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {}
}

// Custom domain — dev only. Prod apex is configured via the ALIAS record in
// Initialize-DNS.ps1 after the SWA exists (cert validation runs once DNS
// resolves). CNAME-at-apex isn't valid DNS, so we don't try it from here.
resource customDomain 'Microsoft.Web/staticSites/customDomains@2023-01-01' = if (environment == 'dev') {
  parent: staticWebApp
  name: domain
  properties: {}
}

// Cosmos DB — serverless billing (free tier and serverless are mutually
// exclusive on Cosmos; the workload is low/bursty, so serverless wins).
resource cosmosDbAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosDbAccountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    publicNetworkAccess: 'Enabled'
    // Metadata writes via account key are disabled — all schema changes go
    // through the ARM control plane, all data access uses the managed
    // identity's data-plane RBAC role.
    disableKeyBasedMetadataWriteAccess: true
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosDbAccount
  name: cosmosDbDatabaseName
  properties: {
    resource: {
      id: cosmosDbDatabaseName
    }
  }
}

resource usersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDb
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
        excludedPaths: [
          {
            path: '/"_etag"/?'
          }
        ]
      }
    }
  }
}

resource profilesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDb
  name: 'profiles'
  properties: {
    resource: {
      id: 'profiles'
      partitionKey: {
        paths: [
          '/userId'
        ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
        excludedPaths: [
          {
            path: '/"_etag"/?'
          }
        ]
      }
    }
  }
}

// connections: many-to-many between users. Partition key /userId1 makes
// queries by userId1 fast but fans-out when querying by userId2. If this
// model stays, write two rows per connection (one per side) at insert time.
resource connectionsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDb
  name: 'connections'
  properties: {
    resource: {
      id: 'connections'
      partitionKey: {
        paths: [
          '/userId1'
        ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
      }
    }
  }
}

// Cosmos DB data plane RBAC for the managed identity.
var cosmosDbDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

resource cosmosDbRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmosDbAccount
  name: guid(cosmosDbAccount.id, managedIdentity.id, cosmosDbDataContributorRoleId)
  properties: {
    roleDefinitionId: '/${subscription().id}/resourceGroups/${resourceGroup().name}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccount.name}/sqlRoleDefinitions/${cosmosDbDataContributorRoleId}'
    principalId: managedIdentity.properties.principalId
    scope: cosmosDbAccount.id
  }
}

// ARM control-plane RBAC: grant the managed identity Contributor on its
// own resource group so GitHub Actions (federated to this MI via OIDC)
// can run `az deployment group create` against this RG. Without this,
// the workflow's infra_apply_dev job has no permission to deploy Bicep
// updates and falls back to operator-clicked PowerShell.
//
// Bootstrap: the FIRST application of this Bicep must come from an
// identity that already has User Access Administrator / Owner on the
// RG (typically the maintainer running `Initialize-Infra.ps1` locally).
// After that, this role assignment is in place and CI can apply
// subsequent updates.
//
// Built-in role IDs are subscription-scoped and stable. Contributor:
// b24988ac-6180-42a0-ab88-20f7382dd24c.
var contributorRoleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'

resource managedIdentityContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: resourceGroup()
  name: guid(resourceGroup().id, managedIdentity.id, contributorRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', contributorRoleId)
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Cosmos secrets live in Key Vault as the canonical store for operator /
// rotation use. The SWA app settings below also get the connection string
// directly because SWA Free doesn't resolve Key Vault references (Standard
// does — see the commented alternative).
resource cosmosDbConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'COSMOS-DB-CONNECTION-STRING'
  properties: {
    value: cosmosDbAccount.listConnectionStrings().connectionStrings[0].connectionString
  }
}

resource cosmosDbEndpointSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'COSMOS-DB-ENDPOINT'
  properties: {
    value: cosmosDbAccount.properties.documentEndpoint
  }
}

resource cosmosDbDatabaseNameSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'COSMOS-DB-DATABASE-NAME'
  properties: {
    value: cosmosDbDatabaseName
  }
}

// Static Web App app settings. The Azure Functions under api/ read
// COSMOS_DB_CONNECTION_STRING from env vars, so we wire it here.
//
// On SWA Free this value is written literally — visible in ARM / Portal to
// anyone with Reader on the SWA. On SWA Standard, swap the plain value for
// the Key Vault reference (commented below) for least-privilege access.
resource staticWebAppConfig 'Microsoft.Web/staticSites/config@2023-01-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    COSMOS_DB_ENDPOINT: cosmosDbAccount.properties.documentEndpoint
    COSMOS_DB_DATABASE_NAME: cosmosDbDatabaseName
    COSMOS_DB_CONNECTION_STRING: cosmosDbAccount.listConnectionStrings().connectionStrings[0].connectionString
    // On SWA Standard + KV references, prefer:
    // COSMOS_DB_CONNECTION_STRING: '@Microsoft.KeyVault(SecretUri=${cosmosDbConnectionStringSecret.properties.secretUri})'
    KEY_VAULT_URI: keyVault.properties.vaultUri
    MANAGED_IDENTITY_CLIENT_ID: managedIdentity.properties.clientId
    ENVIRONMENT: environment
    // Comma-separated GitHub logins to seed as admins on first sign-in.
    // Read by /api/get-roles → resolveRoles bootstrap path. After a user
    // logs in, the persistent AdminRoster (Cosmos) takes over — leaving
    // this set is harmless.
    ADMIN_GITHUB_LOGINS: adminGithubLogins
  }
}

output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
output staticWebAppId string = staticWebApp.id
output keyVaultUri string = keyVault.properties.vaultUri
output managedIdentityClientId string = managedIdentity.properties.clientId
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
output domain string = domain
output cosmosDbEndpoint string = cosmosDbAccount.properties.documentEndpoint
output cosmosDbAccountName string = cosmosDbAccount.name
output cosmosDbDatabaseName string = cosmosDbDatabaseName
