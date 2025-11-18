param location string = 'eastus'
param environment string = 'dev'
param githubRepo string = 'rmjoia/codepalsio'
param currentUserObjectId string = ''

var project = 'codepals'
var staticWebAppName = '${project}-${environment}'
var keyVaultName = '${project}-${environment}-kv'
var managedIdentityName = '${project}-${environment}-mi'
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

// Custom domain configuration
resource customDomain 'Microsoft.Web/staticSites/customDomains@2023-01-01' = {
  parent: staticWebApp
  name: domain
  properties: {}
}

// Outputs
output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
output staticWebAppId string = staticWebApp.id
output keyVaultUri string = keyVault.properties.vaultUri
output managedIdentityClientId string = managedIdentity.properties.clientId
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
output domain string = domain
