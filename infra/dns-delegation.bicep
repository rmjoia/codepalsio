@description('Resource group that owns the parent DNS zone (codepals.io). Aligns with Initialize-DNS.ps1 which expects zones in platform-$env resource groups.')
param parentZoneResourceGroup string = 'platform-prod'

@description('Parent DNS zone name (apex).')
param parentZoneName string = 'codepals.io'

@description('Subdomain label to delegate (created as an NS record under the parent zone).')
param subdomain string = 'dev'

@description('Nameservers of the child zone (the values printed by Initialize-DNSZones for the dev zone).')
param childNameservers array = [
  'ns1-07.azure-dns.com.'
  'ns2-07.azure-dns.net.'
  'ns3-07.azure-dns.org.'
  'ns4-07.azure-dns.info.'
]

@description('TTL (seconds) for the NS delegation record.')
param ttlSeconds int = 3600

// Scope to the platform RG that owns the parent zone — without this, the
// template assumes the zone is in the same deployment RG and breaks.
resource parentZone 'Microsoft.Network/dnsZones@2018-05-01' existing = {
  name: parentZoneName
  scope: resourceGroup(parentZoneResourceGroup)
}

resource delegation 'Microsoft.Network/dnsZones/NS@2018-05-01' = {
  parent: parentZone
  name: subdomain
  properties: {
    TTL: ttlSeconds
    NSRecords: [for ns in childNameservers: {
      nsdname: ns
    }]
  }
}
