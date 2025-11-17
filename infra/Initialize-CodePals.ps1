#!/usr/bin/env pwsh
<#
.SYNOPSIS
Initialize CodePals.io infrastructure for landing page deployment.

.DESCRIPTION
Provisions all resources needed to deploy landing page to Azure Static Web Apps:
- Resource Group
- Static Web App
- Managed Identity
- Key Vault (stores all secrets)
- DNS records in Azure

After running, manually configure DNS in GoDaddy.

.PARAMETER Environment
'dev' or 'prod'

.PARAMETER SubscriptionId
Azure subscription ID (GUID). If not provided, uses current logged-in subscription.

.PARAMETER Location
Azure region. Default: northeurope

.EXAMPLE
./Initialize-CodePals-Infra.ps1 -Environment dev

.EXAMPLE
./Initialize-CodePals-Infra.ps1 -Environment prod -SubscriptionId "6561ed3a-120c-4692-880a-c1994e86999f"

#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment,

    [Parameter(Mandatory = $false)]
    [string]$SubscriptionId,

    [Parameter(Mandatory = $false)]
    [string]$Location = 'northeurope'
)

$ErrorActionPreference = 'Stop'

# Configuration
$Project = 'codepals'
$ResourceGroupName = "$Project-$Environment-rg"
$StaticWebAppName = "$Project-$Environment"
$KeyVaultName = "$Project-$Environment-kv"
$ManagedIdentityName = "$Project-$Environment-mi"
$Domain = if ($Environment -eq 'dev') { 'dev.codepals.io' } else { 'codepals.io' }

Write-Host "🚀 Initializing CodePals infrastructure" -ForegroundColor Cyan
Write-Host "Environment: $Environment | Domain: $Domain | Location: $Location" -ForegroundColor Green

# 1. Set subscription
Write-Host "`n→ Setting subscription..."
if ($SubscriptionId) {
    Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
    Write-Host "   Using subscription: $SubscriptionId"
} else {
    $context = Get-AzContext
    if (-not $context) {
        Write-Host "   No Azure context. Run: Connect-AzAccount" -ForegroundColor Red
        exit 1
    }
    $SubscriptionId = $context.Subscription.Id
    Write-Host "   Using current subscription: $SubscriptionId"
}

# 2. Create resource group
Write-Host "→ Creating resource group: $ResourceGroupName"
New-AzResourceGroup -Name $ResourceGroupName -Location $Location -Tag @{ project=$Project; environment=$Environment } -Force | Out-Null

# 3. Deploy Bicep template
Write-Host "→ Deploying infrastructure via Bicep..."
$BicepFile = Join-Path (Split-Path $PSCommandPath) "main.bicep"

# Use Invoke-Expression to avoid early Bicep validation
$cmd = @"
New-AzResourceGroupDeployment ``
    -ResourceGroupName '$ResourceGroupName' ``
    -TemplateFile '$BicepFile' ``
    -location '$Location' ``
    -environment '$Environment'
"@

$Deployment = Invoke-Expression $cmd
$SWAUrl = $Deployment.Outputs['staticWebAppDefaultHostname'].Value
$MIClientId = $Deployment.Outputs['managedIdentityClientId'].Value
$MIPrincipalId = $Deployment.Outputs['managedIdentityPrincipalId'].Value

# 4. Store managed identity credentials in Key Vault
Write-Host "→ Storing managed identity credentials in Key Vault"
$kvSecret = ConvertTo-SecureString -String $MIClientId -AsPlainText -Force
Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "MANAGED-IDENTITY-CLIENT-ID" -SecretValue $kvSecret -Verbose:$false | Out-Null

# 5. Get Static Web App and deployment token
Write-Host "→ Getting deployment token..."
$swa = Get-AzStaticWebApp -ResourceGroupName $ResourceGroupName -Name $StaticWebAppName
$Token = $swa.ApiKey

# Store token in Key Vault
$tokenSecret = ConvertTo-SecureString -String $Token -AsPlainText -Force
Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "AZURE-STATIC-WEB-APPS-TOKEN" -SecretValue $tokenSecret -Verbose:$false | Out-Null

# 6. Create federated identity credential for GitHub Actions
Write-Host "→ Creating federated identity for GitHub Actions"
$GitHubRepo = "rmjoia/codepalsio"
$FederatedCredentialName = "github-actions-$Environment"

$federatedCredentialParams = @{
    ResourceGroupName = $ResourceGroupName
    UserAssignedIdentityName = $ManagedIdentityName
    Name = $FederatedCredentialName
    Issuer = "https://token.actions.githubusercontent.com"
    Subject = "repo:$($GitHubRepo):ref:refs/heads/main"
}
New-AzFederatedIdentityCredential @federatedCredentialParams -Verbose:$false | Out-Null

# 7. Summary
Write-Host "`n✅ Infrastructure initialized!" -ForegroundColor Green

# Get Static Web App default domain for CNAME
$DefaultDomain = $SWAUrl

Write-Host "`n📋 Resources created:"
Write-Host "   Resource Group: $ResourceGroupName"
Write-Host "   Static Web App: $StaticWebAppName"
Write-Host "   Default URL: https://$SWAUrl"
Write-Host "   Managed Identity: $ManagedIdentityName"
Write-Host "   Key Vault: $KeyVaultName"

Write-Host "`n🔑 Secrets stored in Key Vault ($KeyVaultName):"
Write-Host "   - MANAGED-IDENTITY-CLIENT-ID"
Write-Host "   - AZURE-STATIC-WEB-APPS-TOKEN"

Write-Host "`n🔐 GitHub Actions Authentication:"
Write-Host "   - Federated Identity: $FederatedCredentialName"
Write-Host "   - No secrets stored (uses OIDC)"
Write-Host "   - Workflows use: @azure/login with federated token"

Write-Host "`n🌐 DNS Configuration (GoDaddy):"
Write-Host "   CNAME: $Domain → $DefaultDomain"
Write-Host "   TXT: _acm-challenge → (see Azure verification)"

Write-Host "`n📝 GitHub Secrets Setup:"
Write-Host "   Name: AZURE_STATIC_WEB_APPS_TOKEN"
Write-Host "   Value: $Token"
Write-Host "   (Set via: gh secret set AZURE_STATIC_WEB_APPS_TOKEN --body '...')"

Write-Host "`n✨ Next: Add GitHub secrets, then create CI/CD workflows"
