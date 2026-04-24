<#
.SYNOPSIS
Initialize DNS records for CodePals landing page.

.DESCRIPTION
Creates or updates the zone-apex record in the environment's DNS zone to
point at the Static Web App. Uses Azure DNS ALIAS (A-type) records, since
CNAME at a zone apex is not allowed in standard DNS.

.EXAMPLE
Initialize-DNS -Environment dev -StaticWebAppDomain codepals-dev.azurestaticapps.net `
    -StaticWebAppResourceId "/subscriptions/.../sites/codepals-dev"

.EXAMPLE
Initialize-DNS -Environment prod -StaticWebAppDomain codepals-prod.azurestaticapps.net `
    -StaticWebAppResourceId "/subscriptions/.../sites/codepals-prod"
#>

function Initialize-DNS {
    <#
    .SYNOPSIS
    Configure the DNS apex record for a CodePals environment.

    .PARAMETER Environment
    'dev' or 'prod'. Selects the zone name and RG.

    .PARAMETER StaticWebAppDomain
    The default hostname of the Static Web App (e.g., codepals-dev.azurestaticapps.net).
    Used for logging and as a fallback for older record types.

    .PARAMETER StaticWebAppResourceId
    The full Azure resource ID of the Static Web App. Required for ALIAS records.

    .PARAMETER SubscriptionId
    Azure subscription ID. If not provided, uses the current context.
    #>

    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('dev', 'prod')]
        [string]$Environment,

        [Parameter(Mandatory = $true)]
        [string]$StaticWebAppDomain,

        [Parameter(Mandatory = $true)]
        [string]$StaticWebAppResourceId,

        [Parameter(Mandatory = $false)]
        [string]$SubscriptionId
    )

    $ErrorActionPreference = 'Stop'
    $WarningPreference = 'SilentlyContinue'

    Write-Host "🌐 Configuring DNS for CodePals" -ForegroundColor Cyan
    Write-Host "Environment: $Environment | SWA: $StaticWebAppDomain" -ForegroundColor Green

    if ($SubscriptionId) {
        Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
        Write-Host "→ Using subscription: $SubscriptionId"
    }

    # Both environments have their own zone (dev.codepals.io is delegated via
    # an NS record in the codepals.io parent zone; see dns-delegation.bicep).
    $DnsZoneName = if ($Environment -eq 'dev') { 'dev.codepals.io' } else { 'codepals.io' }
    $PlatformResourceGroup = "platform-$Environment"

    Write-Host "→ Configuring zone: $DnsZoneName in $PlatformResourceGroup"

    try {
        $dnsZone = Get-AzDnsZone -ResourceGroupName $PlatformResourceGroup -Name $DnsZoneName -ErrorAction Stop
        Write-Host "   DNS zone found: $($dnsZone.Name)"

        # Azure DNS does not allow CNAME at a zone apex — the previous
        # implementation would silently fail the API call. Use an ALIAS A
        # record (A-type RecordSet with -TargetResourceId) pointing at the
        # SWA resource. Certificate validation for the custom domain runs
        # once this resolves. (Copilot C11)

        $existingApexA = Get-AzDnsRecordSet -ResourceGroupName $PlatformResourceGroup `
            -ZoneName $DnsZoneName -Name '@' -RecordType A -ErrorAction SilentlyContinue
        $existingApexCname = Get-AzDnsRecordSet -ResourceGroupName $PlatformResourceGroup `
            -ZoneName $DnsZoneName -Name '@' -RecordType CNAME -ErrorAction SilentlyContinue

        # Clean up any legacy CNAME at apex — it was never valid, and it
        # blocks creation of the A-type ALIAS that replaces it.
        if ($existingApexCname) {
            if ($PSCmdlet.ShouldProcess("$DnsZoneName (@ CNAME)", "Remove legacy apex CNAME before creating ALIAS")) {
                Write-Host "→ Removing invalid legacy CNAME at apex"
                Remove-AzDnsRecordSet -RecordSet $existingApexCname | Out-Null
            }
        }

        if ($existingApexA -and $existingApexA.TargetResourceId -eq $StaticWebAppResourceId) {
            Write-Host "→ Apex ALIAS A already points at the Static Web App, skipping update" -ForegroundColor Green
        } elseif ($existingApexA) {
            if ($PSCmdlet.ShouldProcess("$DnsZoneName (@ A ALIAS)", "Update ALIAS target to SWA")) {
                Write-Host "→ Updating apex ALIAS A → $StaticWebAppDomain"
                $existingApexA.TargetResourceId = $StaticWebAppResourceId
                Set-AzDnsRecordSet -RecordSet $existingApexA | Out-Null
                Write-Host "   ✓ ALIAS record updated" -ForegroundColor Green
            }
        } elseif ($PSCmdlet.ShouldProcess("$DnsZoneName (@ A ALIAS)", "Create ALIAS pointing to SWA")) {
            Write-Host "→ Creating apex ALIAS A → $StaticWebAppDomain"
            New-AzDnsRecordSet -ResourceGroupName $PlatformResourceGroup -ZoneName $DnsZoneName `
                -Name '@' -RecordType A -Ttl 3600 `
                -TargetResourceId $StaticWebAppResourceId | Out-Null
            Write-Host "   ✓ ALIAS record created" -ForegroundColor Green
        }

        Write-Host "`n✅ DNS configured"
        Write-Host "`n📋 DNS Configuration:"
        Write-Host "   Zone: $DnsZoneName"
        Write-Host "   Record: @ (A ALIAS → Static Web App resource)"
        Write-Host "   Target: $StaticWebAppDomain"
        Write-Host "   TTL: 3600 seconds"
    }
    catch {
        Write-Host "❌ DNS configuration failed: $_" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}
