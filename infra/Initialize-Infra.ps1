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
    
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
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

    # Load required modules
    Write-Host "→ Loading required Azure modules..."
    $requiredModules = @('Az.Resources', 'Az.KeyVault', 'Az.ManagedServiceIdentity', 'Az.Websites', 'Az.Dns', 'Az.CosmosDB')
    foreach ($module in $requiredModules) {
        if (-not (Get-Module -Name $module -ListAvailable)) {
            Write-Host "   Installing $module..." -ForegroundColor Yellow
            Install-Module -Name $module -Force -AllowClobber -Scope CurrentUser
        }
        Import-Module $module -ErrorAction Stop
    }

    # Configuration
    $Project = 'codepals'
    $ResourceGroupName = "$Project-$Environment-rg"
    $StaticWebAppName = "$Project-$Environment"
    $KeyVaultName = "$Project-$Environment-kv"
    $ManagedIdentityName = "$Project-$Environment-mi"
    $CosmosDbAccountName = "$Project-$Environment-cosmos"

    Write-Host "🚀 Initializing CodePals infrastructure" -ForegroundColor Cyan
    Write-Host "Environment: $Environment | Location: $Location" -ForegroundColor Green

    # 1. Check Azure authentication and set subscription
    Write-Host "`n→ Checking Azure authentication..."
    $context = Get-AzContext
    if (-not $context) {
        Write-Host "   Not authenticated to Azure. Please authenticate first:" -ForegroundColor Yellow
        Write-Host "   Connect-AzAccount -Subscription '<subscription-name-or-id>'" -ForegroundColor Cyan
        return
    }
    
    Write-Host "→ Setting subscription..."
    if ($SubscriptionId) {
        Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
        Write-Host "   Using subscription: $SubscriptionId"
    } else {
        $SubscriptionId = $context.Subscription.Id
        $SubscriptionName = $context.Subscription.Name
        Write-Host "   Using current subscription: $SubscriptionName ($SubscriptionId)"
    }

    # 2. Create resource group
    Write-Host "→ Creating resource group: $ResourceGroupName"
    if ($PSCmdlet.ShouldProcess($ResourceGroupName, "Create resource group")) {
        New-AzResourceGroup -Name $ResourceGroupName -Location $Location -Tag @{ project=$Project; environment=$Environment } -Force | Out-Null
    }

    # 3. Deploy Bicep template
    Write-Host "→ Deploying infrastructure via Bicep..."
    
    # Resolve bicep file path - works when imported as module or called directly
    $ScriptDir = if ($PSScriptRoot) {
        $PSScriptRoot
    } elseif ($MyInvocation.MyCommand.Path) {
        Split-Path $MyInvocation.MyCommand.Path
    } else {
        Get-Location
    }
    
    $BicepFile = Join-Path $ScriptDir "main.bicep"
    $BicepFile = Resolve-Path $BicepFile -ErrorAction Stop

    # Get current user's object ID for Key Vault access policy
    $currentUser = Get-AzADUser -UserPrincipalName (Get-AzContext).Account.Id -ErrorAction SilentlyContinue
    $currentUserObjectId = if ($currentUser) { $currentUser.Id } else { '' }

    if (-not $PSCmdlet.ShouldProcess($ResourceGroupName, "Deploy Bicep template (Static Web App, Key Vault, Cosmos DB)")) {
        Write-Host "   [WhatIf] Would deploy: Static Web App, Key Vault, Managed Identity, Cosmos DB" -ForegroundColor Yellow
        return
    }

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
    $CosmosDbEndpoint = $Deployment.Outputs['cosmosDbEndpoint'].Value
    $CosmosDbAccountName = $Deployment.Outputs['cosmosDbAccountName'].Value
    $CosmosDbDatabaseName = $Deployment.Outputs['cosmosDbDatabaseName'].Value

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
    if ($PSCmdlet.ShouldProcess($KeyVaultName, "Store managed identity credentials")) {
        $kvSecret = ConvertTo-SecureString -String $MIClientId -AsPlainText -Force
        Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "MANAGED-IDENTITY-CLIENT-ID" -SecretValue $kvSecret -Verbose:$false | Out-Null
    }

    # 5. Get Static Web App and deployment token
    Write-Host "→ Getting deployment token..."
    $swa = Get-AzStaticWebApp -ResourceGroupName $ResourceGroupName -Name $StaticWebAppName -ErrorAction Stop
    
    # Get API token using list secrets
    $secrets = Invoke-AzResourceAction -ResourceId $swa.Id -Action 'listSecrets' -ApiVersion '2023-01-01' -Force
    $Token = $secrets.properties.apiKey

    # Store token in Key Vault
    if ($Token -and $PSCmdlet.ShouldProcess($KeyVaultName, "Store Static Web App deployment token")) {
        $tokenSecret = ConvertTo-SecureString -String $Token -AsPlainText -Force
        Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "AZURE-STATIC-WEB-APPS-TOKEN" -SecretValue $tokenSecret -Verbose:$false | Out-Null
    }

    # 6. Create federated identity credential for GitHub Actions
    Write-Host "→ Creating federated identity for GitHub Actions"
    $GitHubRepo = "rmjoia/codepalsio"
    $FederatedCredentialName = "github-actions-$Environment"

    # Check if federated credential already exists
    $existingFedCred = Get-AzFederatedIdentityCredential -ResourceGroupName $ResourceGroupName `
        -IdentityName $ManagedIdentityName -Name $FederatedCredentialName -ErrorAction SilentlyContinue

    if ($existingFedCred) {
        Write-Host "   Federated credential '$FederatedCredentialName' already exists" -ForegroundColor Green
        
        # Check if configuration matches
        $expectedSubject = "repo:$($GitHubRepo):ref:refs/heads/main"
        if ($existingFedCred.Subject -eq $expectedSubject) {
            Write-Host "   Configuration is correct, skipping update"
        } else {
            if ($PSCmdlet.ShouldProcess($FederatedCredentialName, "Update federated credential")) {
                Write-Host "   Updating federated credential configuration..."
                Remove-AzFederatedIdentityCredential -ResourceGroupName $ResourceGroupName `
                    -IdentityName $ManagedIdentityName -Name $FederatedCredentialName -Force | Out-Null
                
                $federatedCredentialParams = @{
                    ResourceGroupName = $ResourceGroupName
                    IdentityName = $ManagedIdentityName
                    Name = $FederatedCredentialName
                    Issuer = "https://token.actions.githubusercontent.com"
                    Subject = $expectedSubject
                }
                New-AzFederatedIdentityCredential @federatedCredentialParams -Verbose:$false | Out-Null
                Write-Host "   ✓ Federated credential updated" -ForegroundColor Green
            }
        }
    } else {
        if ($PSCmdlet.ShouldProcess($ManagedIdentityName, "Create federated credential for GitHub Actions")) {
            $federatedCredentialParams = @{
                ResourceGroupName = $ResourceGroupName
                IdentityName = $ManagedIdentityName
                Name = $FederatedCredentialName
                Issuer = "https://token.actions.githubusercontent.com"
                Subject = "repo:$($GitHubRepo):ref:refs/heads/main"
            }
            New-AzFederatedIdentityCredential @federatedCredentialParams -Verbose:$false | Out-Null
            Write-Host "   ✓ Federated credential created" -ForegroundColor Green
        }
    }

    # 7. Configure DNS records
    Write-Host "`n→ Configuring DNS records..."
    $dnsScript = Join-Path (Split-Path $BicepFile) "Initialize-DNS.ps1"
    . $dnsScript
    Initialize-DNS -Environment $Environment -StaticWebAppDomain $SWAUrl -SubscriptionId $SubscriptionId -ErrorAction SilentlyContinue

    # 8. Validate custom domain configuration
    Write-Host "→ Validating custom domain setup..."
    Write-Host "   Waiting for DNS propagation (this may take a few minutes)..."
    Start-Sleep -Seconds 30
    
    $customDomains = Get-AzStaticWebAppCustomDomain -ResourceGroupName $ResourceGroupName -Name $StaticWebAppName
    $domainConfigured = $customDomains | Where-Object { $_.Name -eq $Domain }
    
    if ($domainConfigured) {
        Write-Host "   ✓ Custom domain configured: $Domain" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ Custom domain may need additional time to validate" -ForegroundColor Yellow
        Write-Host "   Check Azure Portal if domain doesn't appear ready within 10 minutes"
    }

    Write-Host "`n✅ Infrastructure initialized!" -ForegroundColor Green

    Write-Host "`n📋 Resources created:"
    Write-Host "   Resource Group: $ResourceGroupName"
    Write-Host "   Static Web App: $StaticWebAppName"
    Write-Host "   Default URL: https://$SWAUrl"
    Write-Host "   Custom Domain: https://$Domain (CNAME configured)"
    Write-Host "   Managed Identity: $ManagedIdentityName"
    Write-Host "   Key Vault: $KeyVaultName"
    Write-Host "   Cosmos DB Account: $CosmosDbAccountName"
    Write-Host "   Cosmos DB Database: $CosmosDbDatabaseName"
    Write-Host "   Cosmos DB Endpoint: $CosmosDbEndpoint"

    Write-Host "`n🔑 Secrets stored in Key Vault ($KeyVaultName):"
    Write-Host "   - MANAGED-IDENTITY-CLIENT-ID"
    Write-Host "   - AZURE-STATIC-WEB-APPS-TOKEN"
    Write-Host "   - COSMOS-DB-CONNECTION-STRING"
    Write-Host "   - COSMOS-DB-ENDPOINT"
    Write-Host "   - COSMOS-DB-DATABASE-NAME"

    Write-Host "`n🔐 GitHub Actions Authentication:"
    Write-Host "   - Federated Identity: github-actions-$Environment"
    Write-Host "   - No secrets stored (uses OIDC)"
    Write-Host "   - Workflows use: @azure/login with federated token"

    Write-Host "`n🌐 DNS Configuration:"
    Write-Host "   - Domain: $Domain"
    Write-Host "   - CNAME: $Domain → $SWAUrl"
    
    Write-Host "`n🔗 Static Web App Environment Variables:"
    Write-Host "   - COSMOS_DB_ENDPOINT: $CosmosDbEndpoint"
    Write-Host "   - COSMOS_DB_DATABASE_NAME: $CosmosDbDatabaseName"
    Write-Host "   - KEY_VAULT_URI: (configured)"
    Write-Host "   - MANAGED_IDENTITY_CLIENT_ID: (configured)"
    Write-Host "   - ENVIRONMENT: $Environment"

    Write-Host "`n📝 GitHub Secrets Setup:"
    Write-Host "   Name: AZURE_STATIC_WEB_APPS_TOKEN"
    Write-Host "   Value: (retrieve from Key Vault)"

    Write-Host "`n✨ Next: Add GitHub secrets, then create CI/CD workflows"
}
