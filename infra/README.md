# CodePals Infrastructure Module

PowerShell module for managing CodePals.io Azure infrastructure. Auth is handled by [Azure Static Web Apps built-in authentication](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization) (`.auth/login/github`), so this module no longer provisions a custom GitHub OAuth app.

## Installation

```powershell
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
- Static Web App (with user-assigned managed identity)
- Key Vault (access policy model; soft delete enabled, 90-day retention)
- User-Assigned Managed Identity (Cosmos DB Data Contributor)
- Cosmos DB serverless account with `users`, `profiles`, `connections` containers
- DNS records for the environment's custom domain
- Federated identity credential for GitHub Actions OIDC

### Initialize-DNS
Configures DNS records for a custom domain pointing at a Static Web App.

```powershell
Initialize-DNS -Environment dev -StaticWebAppDomain "your-swa.azurestaticapps.net"
```

**Parameters:**
- `Environment` (required): 'dev' or 'prod'
- `StaticWebAppDomain` (required): Static Web App default hostname
- `StaticWebAppResourceId` (required for prod apex): full Azure resource ID of the SWA (used for ALIAS record)
- `SubscriptionId` (optional): Azure subscription ID

**Behaviour:**
- For `dev` (subdomain zone `dev.codepals.io`): creates/updates a CNAME at the zone apex (`@`) pointing at the SWA hostname — CNAMEs at apex are allowed because this zone is itself a subdomain delegation.
- For `prod` (apex zone `codepals.io`): creates/updates an Azure DNS **ALIAS** record at the apex targeting the Static Web App resource (CNAME at a true zone apex is not permitted in standard DNS).

### Initialize-DNSZones
Creates the DNS zones and prints the nameservers you need to delegate at your registrar.

```powershell
Initialize-DNSZones -Environment dev
Initialize-DNSZones -Environment prod
```

## Usage Examples

### One-Time Zone Setup

```powershell
Import-Module ./infra/CodePals.Infra.psd1

# Create zones, print NS records to delegate at the registrar
Initialize-DNSZones -Environment prod
Initialize-DNSZones -Environment dev
```

### Provision an Environment

```powershell
Initialize-Infra -Environment dev
Initialize-Infra -Environment prod -SubscriptionId "your-prod-subscription-id"
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
- Authenticated Azure session (`Connect-AzAccount`)

## Architecture

```
infra/
├── CodePals.Infra.psd1          # Module manifest
├── CodePals.Infra.psm1          # Module entrypoint (dot-sources scripts)
├── Initialize-Infra.ps1         # Infrastructure provisioning
├── Initialize-DNS.ps1           # DNS record configuration
├── Initialize-DNSZones.ps1      # DNS zone provisioning
├── main.bicep                   # Core Bicep template (SWA, KV, MI, Cosmos)
├── dns-delegation.bicep         # Subdomain NS delegation template
└── Initialize-Infra.Tests.ps1   # Pester tests
```

## Testing

```powershell
Invoke-Pester -Path ./infra/*.Tests.ps1
```

## Security

Secrets live in Azure Key Vault:
- `AZURE-STATIC-WEB-APPS-TOKEN` — SWA deployment token
- `COSMOS-DB-CONNECTION-STRING` — Cosmos DB connection string
- `COSMOS-DB-ENDPOINT` — Cosmos DB account endpoint
- `COSMOS-DB-DATABASE-NAME` — Cosmos DB database name

The Static Web App's user-assigned managed identity pulls the Cosmos connection string into its app settings via a Key Vault reference at deploy time. The managed identity client ID is exposed as a deployment output and a plain app setting (it's a public identifier, not a secret).

## License

See [LICENSE](../LICENSE) file.
