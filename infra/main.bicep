param location string = 'eastus'
param environment string = 'dev'
param githubRepo string = 'rmjoia/codepalsio'

var project = 'codepals'
var resourceGroupName = '${project}-${environment}-rg'
var staticWebAppName = '${project}-${environment}'
var keyVaultName = '${project}-${environment}-kv'
var managedIdentityName = '${project}-${environment}-mi'
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
    ]
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: false
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

// Outputs
output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
output staticWebAppId string = staticWebApp.id
output keyVaultUri string = keyVault.properties.vaultUri
output managedIdentityClientId string = managedIdentity.properties.clientId
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
