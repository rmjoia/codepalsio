# CodePals Infrastructure Module

PowerShell module for managing CodePals.io Azure infrastructure.

## Installation

```powershell
# Import the module
Import-Module ./infra/CodePals.Infra.psd1
```

## Available Functions

### Initialize-Infra
Provisions the complete Azure infrastructure for CodePals.io.

```powershell
# Dev environment
Initialize-Infra -Environment dev

# Prod environment with specific subscription
Initialize-Infra -Environment prod -SubscriptionId "your-subscription-id"
```

**Parameters:**
- `Environment` (required): 'dev' or 'prod'
- `SubscriptionId` (optional): Azure subscription ID
- `Location` (optional): Azure region (default: westeurope)

**Provisions:**
- Resource Group
- Static Web App
- Key Vault
- Managed Identity
- Cosmos DB (with users, profiles, connections containers)
- DNS records
- Federated credentials for GitHub Actions

### Initialize-DNS
Configures DNS records for custom domain.

```powershell
Initialize-DNS -Environment dev -StaticWebAppDomain "your-swa.azurestaticapps.net"
```

**Parameters:**
- `Environment` (required): 'dev' or 'prod'
- `StaticWebAppDomain` (required): Static Web App default domain
- `SubscriptionId` (optional): Azure subscription ID

**Creates:**
- CNAME record pointing custom domain to Static Web App

### Initialize-GitHubOAuth
Sets up GitHub OAuth application and stores credentials in Key Vault.

```powershell
Initialize-GitHubOAuth -Environment dev
```

**Parameters:**
- `Environment` (required): 'dev' or 'prod'
- `CallbackUrl` (optional): OAuth callback URL (auto-generated based on environment)
- `AppName` (optional): OAuth app name (auto-generated based on environment)

**Stores in Key Vault:**
- `GITHUB-CLIENT-ID`: OAuth app client ID
- `GITHUB-CLIENT-SECRET`: OAuth app client secret
- `JWT-SECRET`: Generated JWT signing secret
- `GITHUB-OAUTH-METADATA`: OAuth app configuration metadata

## Usage Examples

### Complete Infrastructure Setup

```powershell
# Import module
Import-Module ./infra/CodePals.Infra.psd1

# Provision infrastructure
Initialize-Infra -Environment dev

# Set up GitHub OAuth (interactive - requires manual GitHub app creation)
Initialize-GitHubOAuth -Environment dev
```

### Update DNS Only

```powershell
Import-Module ./infra/CodePals.Infra.psd1
Initialize-DNS -Environment dev -StaticWebAppDomain "codepals-dev.azurestaticapps.net"
```

### Production Deployment

```powershell
Import-Module ./infra/CodePals.Infra.psd1

# Provision production infrastructure
Initialize-Infra -Environment prod -SubscriptionId "your-prod-subscription-id"

# Configure production OAuth
Initialize-GitHubOAuth -Environment prod
```

## Prerequisites

- PowerShell 7.0+
- Azure PowerShell modules (installed automatically if missing):
  - Az.Resources
  - Az.KeyVault
  - Az.ManagedServiceIdentity
  - Az.Websites
  - Az.Dns
  - Az.CosmosDB
- Azure CLI (authenticated)
- GitHub CLI (for OAuth setup, authenticated)

## Architecture

```
infra/
├── CodePals.Infra.psd1          # Module manifest
├── CodePals.Infra.psm1          # Main module file
├── Initialize-Infra.ps1         # Infrastructure provisioning
├── Initialize-DNS.ps1           # DNS configuration
├── Initialize-GitHubOAuth.ps1   # GitHub OAuth setup
├── main.bicep                   # Bicep template
└── *.Tests.ps1                  # Pester tests
```

## Testing

```powershell
# Run all tests
Invoke-Pester -Path ./infra/*.Tests.ps1

# Run specific test
Invoke-Pester -Path ./infra/Initialize-GitHubOAuth.Tests.ps1
```

## Security

All secrets are stored in Azure Key Vault and never exposed in plaintext:
- Static Web App deployment token
- Managed Identity client ID
- Cosmos DB connection strings
- GitHub OAuth credentials
- JWT signing secrets

## License

See [LICENSE](../LICENSE) file.
