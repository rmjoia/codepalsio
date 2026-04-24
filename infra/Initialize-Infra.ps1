<#
.SYNOPSIS
Initialize CodePals landing page infrastructure.

.DESCRIPTION
Provisions Static Web App, Key Vault, Managed Identity, Cosmos DB, DNS records,
and federated identity credentials for CodePals landing page deployment.

.EXAMPLE
Import-Module ./infra/CodePals.Infra.psd1
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
    Azure region. Default: westeurope
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

    # Resolve the operator's object ID for the Key Vault access policy.
    # Prefer Get-AzADSignedInUser (works for most interactive sessions and
    # returns the SP's own object for service principals). Fall back to UPN
    # lookup. Fail fast if neither works — passing an empty objectId to the
    # Bicep template would silently build a broken access policy. (Copilot C9)
    $currentUser = Get-AzADSignedInUser -ErrorAction SilentlyContinue
    if (-not $currentUser -and $context.Account.Id) {
        $currentUser = Get-AzADUser -UserPrincipalName $context.Account.Id -ErrorAction SilentlyContinue
    }
    $currentUserObjectId = if ($currentUser -and $currentUser.Id) { $currentUser.Id } else { $null }

    if ([string]::IsNullOrWhiteSpace($currentUserObjectId)) {
        throw "Unable to resolve the signed-in principal object ID. The Key Vault access policy needs a valid objectId. Ensure the current account can be resolved in Microsoft Entra ID, or run this from a context with sufficient directory read permissions."
    }

    # 2. Create resource group
    Write-Host "→ Creating resource group: $ResourceGroupName"
    if ($PSCmdlet.ShouldProcess($ResourceGroupName, "Create resource group")) {
        New-AzResourceGroup -Name $ResourceGroupName -Location $Location -Tag @{ project=$Project; environment=$Environment } -Force | Out-Null
    }

    # 3. Deploy Bicep template
    Write-Host "→ Deploying infrastructure via Bicep..."

    $ScriptDir = if ($PSScriptRoot) {
        $PSScriptRoot
    } elseif ($MyInvocation.MyCommand.Path) {
        Split-Path $MyInvocation.MyCommand.Path
    } else {
        Get-Location
    }

    $BicepFile = Join-Path $ScriptDir "main.bicep"
    $BicepFile = Resolve-Path $BicepFile -ErrorAction Stop

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
    $StaticWebAppId = $Deployment.Outputs['staticWebAppId'].Value
    $MIClientId = $Deployment.Outputs['managedIdentityClientId'].Value
    $Domain = $Deployment.Outputs['domain'].Value
    $CosmosDbEndpoint = $Deployment.Outputs['cosmosDbEndpoint'].Value
    $CosmosDbAccountName = $Deployment.Outputs['cosmosDbAccountName'].Value
    $CosmosDbDatabaseName = $Deployment.Outputs['cosmosDbDatabaseName'].Value

    # 4. Wait for Key Vault data-plane access. Let real errors propagate;
    # treat "secret not found" as success — auth worked, the probe secret
    # just doesn't exist, which is expected. (Copilot C4)
    Write-Host "→ Waiting for Key Vault access..."
    $maxRetries = 10
    $retry = 0
    $kvAccessible = $false

    while ($retry -lt $maxRetries -and -not $kvAccessible) {
        try {
            Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name "probe-access" -ErrorAction Stop | Out-Null
            $kvAccessible = $true
        }
        catch {
            $msg = $_.Exception.Message
            if ($msg -match 'SecretNotFound' -or $msg -match 'not found' -or $msg -match 'was not found') {
                # Auth worked, secret just doesn't exist — vault is reachable.
                $kvAccessible = $true
            }
            else {
                $retry++
                if ($retry -lt $maxRetries) {
                    Start-Sleep -Seconds 2
                }
            }
        }
    }

    if (-not $kvAccessible) {
        throw "Key Vault '$KeyVaultName' is not reachable after $maxRetries retries. Check the access policy was applied and the current user has 'get/list' secret permissions."
    }

    # 5. Fetch the Static Web App deployment token and store it in Key Vault.
    # The MI client ID is a public identifier and lives in app settings (via
    # the Bicep template) — no need to duplicate it as a secret. (H7)
    Write-Host "→ Getting Static Web App deployment token..."
    $swa = Get-AzStaticWebApp -ResourceGroupName $ResourceGroupName -Name $StaticWebAppName -ErrorAction Stop
    $secrets = Invoke-AzResourceAction -ResourceId $swa.Id -Action 'listSecrets' -ApiVersion '2023-01-01' -Force
    $Token = $secrets.properties.apiKey

    if ($Token -and $PSCmdlet.ShouldProcess($KeyVaultName, "Store Static Web App deployment token")) {
        $tokenSecret = ConvertTo-SecureString -String $Token -AsPlainText -Force
        Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "AZURE-STATIC-WEB-APPS-TOKEN" -SecretValue $tokenSecret -Verbose:$false | Out-Null
    }

    # 6. Federated identity credential for GitHub Actions OIDC.
    Write-Host "→ Creating federated identity for GitHub Actions"
    $GitHubRepo = "rmjoia/codepalsio"
    $FederatedCredentialName = "github-actions-$Environment"
    $ExpectedSubject = "repo:$($GitHubRepo):ref:refs/heads/main"

    $existingFedCred = Get-AzFederatedIdentityCredential -ResourceGroupName $ResourceGroupName `
        -IdentityName $ManagedIdentityName -Name $FederatedCredentialName -ErrorAction SilentlyContinue

    if ($existingFedCred) {
        if ($existingFedCred.Subject -eq $ExpectedSubject) {
            Write-Host "   Federated credential already exists with correct subject, skipping" -ForegroundColor Green
        } elseif ($PSCmdlet.ShouldProcess($FederatedCredentialName, "Update federated credential subject")) {
            Remove-AzFederatedIdentityCredential -ResourceGroupName $ResourceGroupName `
                -IdentityName $ManagedIdentityName -Name $FederatedCredentialName -Force | Out-Null
            New-AzFederatedIdentityCredential `
                -ResourceGroupName $ResourceGroupName `
                -IdentityName $ManagedIdentityName `
                -Name $FederatedCredentialName `
                -Issuer "https://token.actions.githubusercontent.com" `
                -Subject $ExpectedSubject -Verbose:$false | Out-Null
            Write-Host "   ✓ Federated credential updated" -ForegroundColor Green
        }
    } elseif ($PSCmdlet.ShouldProcess($ManagedIdentityName, "Create federated credential for GitHub Actions")) {
        New-AzFederatedIdentityCredential `
            -ResourceGroupName $ResourceGroupName `
            -IdentityName $ManagedIdentityName `
            -Name $FederatedCredentialName `
            -Issuer "https://token.actions.githubusercontent.com" `
            -Subject $ExpectedSubject -Verbose:$false | Out-Null
        Write-Host "   ✓ Federated credential created" -ForegroundColor Green
    }

    # 7. DNS records
    Write-Host "`n→ Configuring DNS records..."
    $dnsScript = Join-Path $ScriptDir "Initialize-DNS.ps1"
    . $dnsScript
    Initialize-DNS -Environment $Environment -StaticWebAppDomain $SWAUrl -StaticWebAppResourceId $StaticWebAppId -SubscriptionId $SubscriptionId -ErrorAction SilentlyContinue

    # 8. Poll for custom domain validation instead of sleeping a fixed time. (H10)
    Write-Host "→ Waiting for custom domain validation..."
    $domainTimeoutSeconds = 300
    $pollIntervalSeconds = 10
    $elapsed = 0
    $domainConfigured = $null

    while ($elapsed -lt $domainTimeoutSeconds -and -not $domainConfigured) {
        $customDomains = Get-AzStaticWebAppCustomDomain -ResourceGroupName $ResourceGroupName -Name $StaticWebAppName -ErrorAction SilentlyContinue
        $domainConfigured = $customDomains | Where-Object { $_.Name -eq $Domain -and $_.Status -eq 'Ready' }
        if (-not $domainConfigured) {
            Start-Sleep -Seconds $pollIntervalSeconds
            $elapsed += $pollIntervalSeconds
        }
    }

    if ($domainConfigured) {
        Write-Host "   ✓ Custom domain configured: $Domain" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ Custom domain not yet validated after ${domainTimeoutSeconds}s — DNS may still be propagating" -ForegroundColor Yellow
        Write-Host "   Check the Azure Portal if the domain hasn't gone Ready within 10 minutes."
    }

    Write-Host "`n✅ Infrastructure initialized!" -ForegroundColor Green

    Write-Host "`n📋 Resources created:"
    Write-Host "   Resource Group: $ResourceGroupName"
    Write-Host "   Static Web App: $StaticWebAppName"
    Write-Host "   Default URL: https://$SWAUrl"
    Write-Host "   Custom Domain: https://$Domain"
    Write-Host "   Managed Identity: $ManagedIdentityName (clientId: $MIClientId)"
    Write-Host "   Key Vault: $KeyVaultName"
    Write-Host "   Cosmos DB Account: $CosmosDbAccountName"
    Write-Host "   Cosmos DB Database: $CosmosDbDatabaseName"
    Write-Host "   Cosmos DB Endpoint: $CosmosDbEndpoint"

    Write-Host "`n🔑 Secrets stored in Key Vault ($KeyVaultName):"
    Write-Host "   - AZURE-STATIC-WEB-APPS-TOKEN"
    Write-Host "   - COSMOS-DB-CONNECTION-STRING"
    Write-Host "   - COSMOS-DB-ENDPOINT"
    Write-Host "   - COSMOS-DB-DATABASE-NAME"

    Write-Host "`n🔗 Static Web App app settings:"
    Write-Host "   - COSMOS_DB_ENDPOINT"
    Write-Host "   - COSMOS_DB_DATABASE_NAME"
    Write-Host "   - COSMOS_DB_CONNECTION_STRING"
    Write-Host "   - KEY_VAULT_URI"
    Write-Host "   - MANAGED_IDENTITY_CLIENT_ID"
    Write-Host "   - ENVIRONMENT: $Environment"

    Write-Host "`n🔐 GitHub Actions:"
    Write-Host "   - Federated Identity: $FederatedCredentialName (OIDC, no stored secret)"
    Write-Host "   - Existing workflow: .github/workflows/azure-static-web-apps.yml uses AZURE_STATIC_WEB_APPS_API_TOKEN secret"
    Write-Host "     (populate from KV: $KeyVaultName/AZURE-STATIC-WEB-APPS-TOKEN)"
}
