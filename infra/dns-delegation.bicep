// Dev zone nameservers (hardcoded from dev.codepals.io zone)
var devNameservers = [
  'ns1-07.azure-dns.com.'
  'ns2-07.azure-dns.net.'
  'ns3-07.azure-dns.org.'
  'ns4-07.azure-dns.info.'
]

resource parentZone 'Microsoft.Network/dnsZones@2018-05-01' existing = {
  name: 'codepals.io'
}

resource devDelegation 'Microsoft.Network/dnsZones/NS@2018-05-01' = {
  parent: parentZone
  name: 'dev'
  properties: {
    TTL: 3600
    NSRecords: [for ns in devNameservers: {
      nsdname: ns
    }]
  }
}
