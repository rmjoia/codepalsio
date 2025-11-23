<#
.SYNOPSIS
Initialize DNS records for CodePals landing page.

.DESCRIPTION
Creates CNAME records in existing DNS zones for CodePals Static Web App.

.EXAMPLE
. ./Initialize-DNS.ps1
Initialize-DNS -Environment dev -StaticWebAppDomain codepals-dev.azurestaticapps.net

.EXAMPLE
Initialize-DNS -Environment prod -StaticWebAppDomain codepals-prod.azurestaticapps.net
#>

function Initialize-DNS {
    <#
    .SYNOPSIS
    Initialize DNS records for CodePals
    
    .PARAMETER Environment
    'dev' or 'prod'
    
    .PARAMETER StaticWebAppDomain
    The default hostname of the Static Web App
    
    .PARAMETER PlatformResourceGroup
    Resource group containing DNS zones. Default: platform-prod
    
    .PARAMETER SubscriptionId
    Azure subscription ID (GUID). If not provided, uses current logged-in subscription.
    #>
    
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('dev', 'prod')]
        [string]$Environment,

        [Parameter(Mandatory = $true)]
        [string]$StaticWebAppDomain,

        [Parameter(Mandatory = $false)]
        [string]$SubscriptionId
    )

    $ErrorActionPreference = 'Stop'
    $WarningPreference = 'SilentlyContinue'

    Write-Host "🌐 Configuring DNS for CodePals" -ForegroundColor Cyan
    Write-Host "Environment: $Environment | SWA Domain: $StaticWebAppDomain" -ForegroundColor Green

    # Set subscription if provided
    if ($SubscriptionId) {
        Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
        Write-Host "→ Using subscription: $SubscriptionId"
    }

    # Determine DNS zone name and resource group
    $DnsZoneName = if ($Environment -eq 'dev') { 'dev.codepals.io' } else { 'codepals.io' }
    $PlatformResourceGroup = "platform-$Environment"

    Write-Host "→ Configuring DNS zone: $DnsZoneName in $PlatformResourceGroup"

    try {
        # Get the DNS zone
        $dnsZone = Get-AzDnsZone -ResourceGroupName $PlatformResourceGroup -Name $DnsZoneName -ErrorAction Stop
        Write-Host "   DNS zone found: $($dnsZone.Name)"

        # Check if CNAME record already exists
        $existingRecord = Get-AzDnsRecordSet -ResourceGroupName $PlatformResourceGroup -ZoneName $DnsZoneName `
            -Name '@' -RecordType CNAME -ErrorAction SilentlyContinue

        if ($existingRecord) {
            $existingCname = $existingRecord.Records[0].Cname
            if ($existingCname -eq $StaticWebAppDomain) {
                Write-Host "→ CNAME record @ already exists with correct value: $StaticWebAppDomain" -ForegroundColor Green
                Write-Host "   Skipping DNS update (already configured)"
            } else {
                if ($PSCmdlet.ShouldProcess("$DnsZoneName (@)", "Update CNAME from $existingCname to $StaticWebAppDomain")) {
                    Write-Host "→ Updating CNAME record @ from $existingCname → $StaticWebAppDomain"
                    $cname = New-AzDnsRecordConfig -Cname $StaticWebAppDomain
                    Set-AzDnsRecordSet -RecordSet $existingRecord -Overwrite `
                        -DnsRecords $cname | Out-Null
                    Write-Host "   ✓ CNAME record updated" -ForegroundColor Green
                }
            }
        } else {
            if ($PSCmdlet.ShouldProcess("$DnsZoneName (@)", "Create CNAME pointing to $StaticWebAppDomain")) {
                Write-Host "→ Creating CNAME record @ → $StaticWebAppDomain"
                $cname = New-AzDnsRecordConfig -Cname $StaticWebAppDomain
                New-AzDnsRecordSet -ResourceGroupName $PlatformResourceGroup -ZoneName $DnsZoneName `
                    -Name '@' -RecordType CNAME -Ttl 3600 -DnsRecords $cname | Out-Null
                Write-Host "   ✓ CNAME record created" -ForegroundColor Green
            }
        }

        Write-Host "`n✅ DNS configured successfully!"
        Write-Host "`n📋 DNS Configuration:"
        Write-Host "   Zone: $DnsZoneName"
        Write-Host "   Record: @ (CNAME)"
        Write-Host "   Target: $StaticWebAppDomain"
        Write-Host "   TTL: 3600 seconds"
    }
    catch {
        Write-Host "❌ DNS configuration failed: $_" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}