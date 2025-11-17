<#
.SYNOPSIS
Initialize DNS zones for CodePals.

.DESCRIPTION
Creates DNS zones in Azure and displays nameservers for GoDaddy configuration.

.EXAMPLE
. ./Initialize-DNSZones.ps1
Initialize-DNSZones -Environment dev

.EXAMPLE
Initialize-DNSZones -Environment prod
#>

function Initialize-DNSZones {
    <#
    .SYNOPSIS
    Initialize DNS zones
    
    .PARAMETER Environment
    'dev' or 'prod'
    
    .PARAMETER SubscriptionId
    Azure subscription ID (GUID). If not provided, uses current logged-in subscription.
    
    .PARAMETER PlatformResourceGroup
    Resource group for DNS zones. Default: platform-prod
    #>
    
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('dev', 'prod')]
        [string]$Environment,

        [Parameter(Mandatory = $false)]
        [string]$SubscriptionId
    )

    $ErrorActionPreference = 'Stop'
    $WarningPreference = 'SilentlyContinue'

    Write-Host "🌐 Initializing CodePals DNS zones" -ForegroundColor Cyan
    Write-Host "Environment: $Environment" -ForegroundColor Green

    # Set subscription
    if ($SubscriptionId) {
        Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
        Write-Host "→ Using subscription: $SubscriptionId"
    } else {
        $context = Get-AzContext
        if (-not $context) {
            Write-Host "   No Azure context. Run: Connect-AzAccount" -ForegroundColor Red
            return
        }
        $SubscriptionId = $context.Subscription.Id
        Write-Host "→ Using current subscription: $SubscriptionId"
    }

    # Determine DNS zone name and resource group
    $DnsZoneName = if ($Environment -eq 'dev') { 'dev.codepals.io' } else { 'codepals.io' }
    $PlatformResourceGroup = "platform-$Environment"

    Write-Host "→ Creating DNS zone: $DnsZoneName in $PlatformResourceGroup"

    # Verify resource group exists
    $rg = Get-AzResourceGroup -Name $PlatformResourceGroup -ErrorAction SilentlyContinue
    if (-not $rg) {
        Write-Host "   ERROR: Resource group $PlatformResourceGroup does not exist!" -ForegroundColor Red
        return
    }

    # Create or get DNS zone
    $dnsZone = Get-AzDnsZone -ResourceGroupName $PlatformResourceGroup -Name $DnsZoneName -ErrorAction SilentlyContinue
    if (-not $dnsZone) {
        Write-Host "   Creating new DNS zone: $DnsZoneName"
        $dnsZone = New-AzDnsZone -ResourceGroupName $PlatformResourceGroup -Name $DnsZoneName
    } else {
        Write-Host "   DNS zone already exists: $DnsZoneName"
    }

    Write-Host "`n✅ DNS zone ready!" -ForegroundColor Green

    Write-Host "`n🌐 Azure DNS Nameservers for $DnsZoneName" -ForegroundColor Yellow
    foreach ($ns in $dnsZone.NameServers) {
        Write-Host "   - $ns" -ForegroundColor Cyan
    }
    
    # If prod environment, add dev NS delegation (hardcoded nameservers from dev zone)
    if ($Environment -eq 'prod') {
        Write-Host "`n→ Adding dev subdomain NS delegation records"
        
        # Hardcoded dev nameservers from dev.codepals.io zone
        $devNameservers = @('ns1-07.azure-dns.com.', 'ns2-07.azure-dns.net.', 'ns3-07.azure-dns.org.', 'ns4-07.azure-dns.info.')
        $nsRecords = @()
        foreach ($ns in $devNameservers) {
            $nsRecords += New-AzDnsRecordConfig -Nsdname $ns
        }
        
        New-AzDnsRecordSet -ResourceGroupName $PlatformResourceGroup -ZoneName $DnsZoneName `
            -Name 'dev' -RecordType NS -Ttl 3600 -DnsRecords $nsRecords -Overwrite | Out-Null
        Write-Host "   Dev NS delegation records added"
    }
}
