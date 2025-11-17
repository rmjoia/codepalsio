<#
.SYNOPSIS
Initialize CodePals landing page infrastructure.

.DESCRIPTION
Provisions Static Web App, Key Vault, Managed Identity for CodePals landing page deployment.

.EXAMPLE
. ./Initialize-CodePals.ps1
Initialize-Infra -Environment dev

.EXAMPLE
Initialize-Infra -Environment prod -SubscriptionId "6561ed3a-120c-4692-880a-c1994e86999f"
#>

function Initialize-Infra {
    <#
    .SYNOPSIS
    Initialize CodePals infrastructure
    
    .PARAMETER Environment
    'dev' or 'prod'
    
    .PARAMETER SubscriptionId
    Azure subscription ID (GUID). If not provided, uses current logged-in subscription.
    
    .PARAMETER Location
    Azure region. Default: northeurope
    #>
    
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('dev', 'prod')]
        [string]$Environment,

        [Parameter(Mandatory = $false)]
        [string]$SubscriptionId,

        [Parameter(Mandatory = $false)]
        [ValidateSet('westus2', 'centralus', 'eastus2', 'westeurope', 'eastasia')]
        [string]$Location = 'westeurope'
    )

    $ErrorActionPreference = 'Stop'
    $WarningPreference = 'SilentlyContinue'

    # Configuration
    $Project = 'codepals'
    $ResourceGroupName = "$Project-$Environment-rg"
    $StaticWebAppName = "$Project-$Environment"
    $KeyVaultName = "$Project-$Environment-kv"
    $ManagedIdentityName = "$Project-$Environment-mi"

    Write-Host "🚀 Initializing CodePals infrastructure" -ForegroundColor Cyan
    Write-Host "Environment: $Environment | Location: $Location" -ForegroundColor Green

    # 1. Set subscription
    Write-Host "`n→ Setting subscription..."
    if ($SubscriptionId) {
        Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
        Write-Host "   Using subscription: $SubscriptionId"
    } else {
        $context = Get-AzContext
        if (-not $context) {
            Write-Host "   No Azure context. Run: Connect-AzAccount" -ForegroundColor Red
            return
        }
        $SubscriptionId = $context.Subscription.Id
        Write-Host "   Using current subscription: $SubscriptionId"
    }

    # 2. Create resource group
    Write-Host "→ Creating resource group: $ResourceGroupName"
    New-AzResourceGroup -Name $ResourceGroupName -Location $Location -Tag @{ project=$Project; environment=$Environment } -Force | Out-Null

    # 3. Deploy Bicep template
    Write-Host "→ Deploying infrastructure via Bicep..."
    
    # Resolve bicep file path - works when imported as module or called directly
    $BicepFile = if ($MyInvocation.MyCommand.Path) {
        Join-Path (Split-Path $MyInvocation.MyCommand.Path) "main.bicep"
    } else {
        Join-Path (Get-Location) "main.bicep"
    }
    
    $BicepFile = Resolve-Path $BicepFile -ErrorAction Stop

    # Get current user's object ID for Key Vault access policy
    $currentUser = Get-AzADUser -UserPrincipalName (Get-AzContext).Account.Id -ErrorAction SilentlyContinue
    $currentUserObjectId = if ($currentUser) { $currentUser.Id } else { '' }

    $Deployment = New-AzResourceGroupDeployment `
        -ResourceGroupName $ResourceGroupName `
        -TemplateFile $BicepFile `
        -location $Location `
        -environment $Environment `
        -currentUserObjectId $currentUserObjectId

    $SWAUrl = $Deployment.Outputs['staticWebAppDefaultHostname'].Value
    $MIClientId = $Deployment.Outputs['managedIdentityClientId'].Value
    $MIPrincipalId = $Deployment.Outputs['managedIdentityPrincipalId'].Value
    $Domain = $Deployment.Outputs['domain'].Value

    # Wait for Key Vault to be accessible
    Write-Host "→ Waiting for Key Vault access..."
    $maxRetries = 10
    $retry = 0
    $kvAccessible = $false
    
    while ($retry -lt $maxRetries -and -not $kvAccessible) {
        try {
            Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "placeholder" -ErrorAction SilentlyContinue | Out-Null
            $kvAccessible = $true
        }
        catch {
            $retry++
            if ($retry -lt $maxRetries) {
                Start-Sleep -Seconds 2
            }
        }
    }

    # 4. Store managed identity credentials in Key Vault
    Write-Host "→ Storing managed identity credentials in Key Vault"
    $kvSecret = ConvertTo-SecureString -String $MIClientId -AsPlainText -Force
    Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "MANAGED-IDENTITY-CLIENT-ID" -SecretValue $kvSecret -Verbose:$false | Out-Null

    # 5. Get Static Web App and deployment token
    Write-Host "→ Getting deployment token..."
    $swa = Get-AzStaticWebApp -ResourceGroupName $ResourceGroupName -Name $StaticWebAppName -ErrorAction Stop
    $Token = $swa.RepositoryToken

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

    # 7. Configure DNS records
    Write-Host "`n→ Configuring DNS records..."
    $dnsScript = Join-Path (Split-Path $BicepFile) "Initialize-DNS.ps1"
    . $dnsScript
    Initialize-DNS -Environment $Environment -StaticWebAppDomain $SWAUrl -SubscriptionId $SubscriptionId -ErrorAction SilentlyContinue

    Write-Host "`n✅ Infrastructure initialized!" -ForegroundColor Green

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
    Write-Host "   - Federated Identity: github-actions-$Environment"
    Write-Host "   - No secrets stored (uses OIDC)"
    Write-Host "   - Workflows use: @azure/login with federated token"

    Write-Host "`n🌐 DNS Configuration:"
    Write-Host "   - Domain: $Domain"
    Write-Host "   - CNAME: $Domain → $SWAUrl"

    Write-Host "`n📝 GitHub Secrets Setup:"
    Write-Host "   Name: AZURE_STATIC_WEB_APPS_TOKEN"
    Write-Host "   Value: (retrieve from Key Vault)"

    Write-Host "`n✨ Next: Add GitHub secrets, then create CI/CD workflows"
}
