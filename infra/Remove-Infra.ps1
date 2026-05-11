<#
.SYNOPSIS
Tear down a CodePals environment completely — RG + soft-deleted Key Vault purge.

.DESCRIPTION
Deletes the resource group for the given environment and purges the
soft-deleted Key Vault so the name can be reused immediately by a
subsequent Initialize-Infra run. Without the purge step, the KV name
stays reserved for `softDeleteRetentionInDays` (7 for dev, 90 for prod).

Cosmos DB has no soft-delete — the account name is released as soon as
the RG delete completes. DNS zones are not touched (they may be in a
different RG, owned by the parent zone for delegations).

.PARAMETER Environment
'dev' or 'prod'. Production is blocked behind the -Force switch with an
extra typed confirmation so this can't be triggered by an accidental tab.

.PARAMETER SubscriptionId
Azure subscription ID. Defaults to the current logged-in subscription.

.PARAMETER Location
Azure region where the soft-deleted KV lives. Default: westeurope
(matches Initialize-Infra).

.PARAMETER Force
Required for prod. Skips the confirmation prompts even in dev. Combine
with -Confirm:$false to fully automate in CI (use with extreme care).

.EXAMPLE
Import-Module ./infra/CodePals.Infra.psd1
Remove-Infra -Environment dev

.EXAMPLE
Remove-Infra -Environment dev -Confirm:$false   # no prompts

.EXAMPLE
Remove-Infra -Environment prod -Force           # production teardown
#>

function Remove-Infra {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('dev', 'prod')]
        [string]$Environment,

        [Parameter(Mandatory = $false)]
        [string]$SubscriptionId,

        [Parameter(Mandatory = $false)]
        [ValidateSet('westus2', 'centralus', 'eastus2', 'westeurope', 'eastasia')]
        [string]$Location = 'westeurope',

        [Parameter(Mandatory = $false)]
        [switch]$Force
    )

    $ErrorActionPreference = 'Stop'

    # Production safety: require -Force AND a typed confirmation. The
    # ConfirmImpact = 'High' on the attribute already prompts, but for
    # prod we want a typed-string gate so muscle memory can't blow away
    # the env on a quick "enter to confirm".
    if ($Environment -eq 'prod' -and -not $Force) {
        throw "Remove-Infra -Environment prod requires -Force. This deletes the resource group, Key Vault, Cosmos DB, and managed identity for production."
    }
    if ($Environment -eq 'prod') {
        $expected = "destroy prod"
        Write-Host ""
        Write-Host "*** PRODUCTION TEARDOWN ***" -ForegroundColor Red
        Write-Host "You are about to delete the production environment." -ForegroundColor Yellow
        $confirmation = Read-Host "Type '$expected' to confirm"
        if ($confirmation -ne $expected) {
            throw "Confirmation did not match. Aborting."
        }
    }

    Write-Host "→ Loading required Azure modules..."
    $requiredModules = @('Az.Resources', 'Az.KeyVault')
    foreach ($module in $requiredModules) {
        if (-not (Get-Module -Name $module -ListAvailable)) {
            Write-Host "   Installing $module..." -ForegroundColor Yellow
            Install-Module -Name $module -Force -AllowClobber -Scope CurrentUser
        }
        Import-Module $module -ErrorAction Stop
    }

    $Project = 'codepals'
    $ResourceGroupName = "$Project-$Environment-rg"
    $KeyVaultName = "$Project-$Environment-kv"

    Write-Host ""
    Write-Host "Target: $ResourceGroupName" -ForegroundColor Cyan
    Write-Host "  - Resource Group + all contained resources"
    Write-Host "  - Soft-deleted Key Vault '$KeyVaultName' (purged after RG delete)"
    Write-Host ""

    # Auth + subscription context
    $context = Get-AzContext
    if (-not $context) {
        throw "Not authenticated to Azure. Run Connect-AzAccount first."
    }
    if ($SubscriptionId) {
        Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
    } else {
        $SubscriptionId = $context.Subscription.Id
    }
    Write-Host "Subscription: $($context.Subscription.Name) ($SubscriptionId)" -ForegroundColor Green

    # Step 1: Delete the resource group (waits for completion).
    $rg = Get-AzResourceGroup -Name $ResourceGroupName -ErrorAction SilentlyContinue
    if ($rg) {
        if ($PSCmdlet.ShouldProcess($ResourceGroupName, "Delete resource group and all contained resources")) {
            Write-Host "→ Deleting resource group $ResourceGroupName (this can take 5-10 minutes)..." -ForegroundColor Yellow
            Remove-AzResourceGroup -Name $ResourceGroupName -Force -ErrorAction Stop | Out-Null
            Write-Host "   ✓ Resource group deleted" -ForegroundColor Green
        }
    } else {
        Write-Host "→ Resource group $ResourceGroupName not found — skipping RG delete" -ForegroundColor DarkGray
    }

    # Step 2: Purge the soft-deleted Key Vault so the name is reusable.
    # Without this, Initialize-Infra on a fresh deploy hits "vault name in
    # use" for up to softDeleteRetentionInDays (7 for dev, 90 for prod).
    # Purge requires `enablePurgeProtection: false` (which Bicep sets).
    $softDeletedKv = Get-AzKeyVault -InRemovedState -ErrorAction SilentlyContinue |
        Where-Object { $_.VaultName -eq $KeyVaultName }
    if ($softDeletedKv) {
        if ($PSCmdlet.ShouldProcess($KeyVaultName, "Purge soft-deleted Key Vault")) {
            Write-Host "→ Purging soft-deleted Key Vault $KeyVaultName..." -ForegroundColor Yellow
            Remove-AzKeyVault -VaultName $KeyVaultName -InRemovedState -Location $Location -Force -ErrorAction Stop
            Write-Host "   ✓ Key Vault purged (name immediately reusable)" -ForegroundColor Green
        }
    } else {
        Write-Host "→ No soft-deleted Key Vault '$KeyVaultName' found — nothing to purge" -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "✅ Environment '$Environment' fully torn down." -ForegroundColor Green
    Write-Host "Run Initialize-Infra -Environment $Environment to recreate."
}
