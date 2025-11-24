param location string = 'eastus'
param environment string = 'dev'
param githubRepo string = 'rmjoia/codepalsio'
param currentUserObjectId string = ''

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

// Managed Identity
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
  tags: tags
}

// Key Vault
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
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: managedIdentity.properties.principalId
        permissions: {
          secrets: [
            'get'
            'list'
          ]
        }
      }
      {
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
    ]
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

// Static Web App
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    repositoryUrl: 'https://github.com/${githubRepo}'
    branch: 'main'
    buildProperties: {
      appLocation: '.'
      outputLocation: 'dist'
    }
  }
}

// Custom domain configuration (only for dev - prod requires manual TXT validation)
resource customDomain 'Microsoft.Web/staticSites/customDomains@2023-01-01' = if (environment == 'dev') {
  parent: staticWebApp
  name: domain
  properties: {}
}

// Cosmos DB Account (Free Tier)
resource cosmosDbAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosDbAccountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
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
    disableKeyBasedMetadataWriteAccess: false
  }
}

// Cosmos DB Database
resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosDbAccount
  name: cosmosDbDatabaseName
  properties: {
    resource: {
      id: cosmosDbDatabaseName
    }
  }
}

// Container: Users
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

// Container: Profiles
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

// Container: Connections
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

// RBAC Role Assignment: Grant Managed Identity access to Cosmos DB
// Built-in role: Cosmos DB Built-in Data Contributor (00000000-0000-0000-0000-000000000002)
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

// Store Cosmos DB connection string in Key Vault
resource cosmosDbConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'COSMOS-DB-CONNECTION-STRING'
  properties: {
    value: cosmosDbAccount.listConnectionStrings().connectionStrings[0].connectionString
  }
}

// Store Cosmos DB endpoint in Key Vault
resource cosmosDbEndpointSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'COSMOS-DB-ENDPOINT'
  properties: {
    value: cosmosDbAccount.properties.documentEndpoint
  }
}

// Store Cosmos DB database name in Key Vault
resource cosmosDbDatabaseNameSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'COSMOS-DB-DATABASE-NAME'
  properties: {
    value: cosmosDbDatabaseName
  }
}

// Configure Static Web App environment variables
resource staticWebAppConfig 'Microsoft.Web/staticSites/config@2023-01-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    COSMOS_DB_ENDPOINT: cosmosDbAccount.properties.documentEndpoint
    COSMOS_DB_DATABASE_NAME: cosmosDbDatabaseName
    KEY_VAULT_URI: keyVault.properties.vaultUri
    MANAGED_IDENTITY_CLIENT_ID: managedIdentity.properties.clientId
    ENVIRONMENT: environment
  }
}

// Outputs
output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
output staticWebAppId string = staticWebApp.id
output keyVaultUri string = keyVault.properties.vaultUri
output managedIdentityClientId string = managedIdentity.properties.clientId
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
output domain string = domain
output cosmosDbEndpoint string = cosmosDbAccount.properties.documentEndpoint
output cosmosDbAccountName string = cosmosDbAccount.name
output cosmosDbDatabaseName string = cosmosDbDatabaseName
