<#
.SYNOPSIS
Pester tests for CodePals infrastructure

.DESCRIPTION
Real functional tests that validate actual Bicep template correctness
#>

Describe 'Bicep Template Compilation' {
    
    It 'Bicep template must compile without errors' {
        $bicepFile = Join-Path $PSScriptRoot 'main.bicep'
        
        # This will fail if template has syntax errors or invalid resource definitions
        $result = az bicep build --file $bicepFile --stdout 2>&1 | Out-String
        $LASTEXITCODE | Should -Be 0 -Because "Bicep template must compile successfully"
        
        # Verify JSON was actually generated
        $result | Should -Not -BeNullOrEmpty
        $result | Should -Match '"resources":'
    }
}

Describe 'Bicep Template Resource Definitions' {
    
    BeforeAll {
        $bicepFile = Join-Path $PSScriptRoot 'main.bicep'
        $compiledJson = az bicep build --file $bicepFile --stdout 2>&1 | ConvertFrom-Json
    }
    
    It 'Must define Cosmos DB with serverless capability' {
        # Free tier and serverless are mutually exclusive on Cosmos DB; we
        # chose serverless (no upfront commitment, low/bursty workload).
        $cosmosAccount = $compiledJson.resources | Where-Object {
            $_.type -eq 'Microsoft.DocumentDB/databaseAccounts'
        }

        $cosmosAccount | Should -Not -BeNullOrEmpty -Because "Cosmos DB account must be defined"
        $capability = $cosmosAccount.properties.capabilities | Where-Object { $_.name -eq 'EnableServerless' }
        $capability | Should -Not -BeNullOrEmpty -Because "Serverless mode is required"
        $cosmosAccount.properties.enableFreeTier | Should -Not -Be $true -Because "Free tier is incompatible with serverless"
    }

    It 'Must disable Cosmos DB key-based metadata writes' {
        $cosmosAccount = $compiledJson.resources | Where-Object {
            $_.type -eq 'Microsoft.DocumentDB/databaseAccounts'
        }
        $cosmosAccount.properties.disableKeyBasedMetadataWriteAccess | Should -Be $true -Because "Schema writes must go through ARM + MI, not the account key"
    }

    It 'Static Web App must have a user-assigned managed identity' {
        $swa = $compiledJson.resources | Where-Object {
            $_.type -eq 'Microsoft.Web/staticSites'
        }
        $swa.identity.type | Should -Be 'UserAssigned' -Because "SWA needs a managed identity to read Key Vault at runtime"
    }

    It 'Static Web App must not set repositoryUrl (managed by GitHub Actions workflow)' {
        $swa = $compiledJson.resources | Where-Object {
            $_.type -eq 'Microsoft.Web/staticSites'
        }
        $swa.properties.repositoryUrl | Should -BeNullOrEmpty -Because "Setting repositoryUrl causes Azure to overwrite the hand-written GitHub Actions workflow"
    }

    It 'Static Web App app settings must include COSMOS_DB_CONNECTION_STRING' {
        $swaConfig = $compiledJson.resources | Where-Object {
            $_.type -eq 'Microsoft.Web/staticSites/config' -and $_.name -match 'appsettings'
        }
        $swaConfig.properties.COSMOS_DB_CONNECTION_STRING | Should -Not -BeNullOrEmpty -Because "The /api/* Azure Functions read COSMOS_DB_CONNECTION_STRING from env vars"
    }

    It 'Key Vault must retain soft-deleted secrets for at least 90 days' {
        $keyVault = $compiledJson.resources | Where-Object {
            $_.type -eq 'Microsoft.KeyVault/vaults'
        }
        $keyVault.properties.softDeleteRetentionInDays | Should -Be 90 -Because "90-day retention is the usual compliance baseline"
    }

    It 'Key Vault must deny by default with AzureServices bypass' {
        $keyVault = $compiledJson.resources | Where-Object {
            $_.type -eq 'Microsoft.KeyVault/vaults'
        }
        $keyVault.properties.networkAcls.defaultAction | Should -Be 'Deny' -Because "Public internet should not reach Key Vault by default"
        $keyVault.properties.networkAcls.bypass | Should -Be 'AzureServices' -Because "Trusted Azure services need to reach KV for managed-identity-based reads"
    }
    
    It 'Must define all three required Cosmos DB containers' {
        $containers = $compiledJson.resources | Where-Object { 
            $_.type -eq 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers' 
        }
        
        $containers.Count | Should -Be 3 -Because "Must have users, profiles, and connections containers"
        
        # Verify each container name is present in the compiled output
        $containersJson = $containers | ConvertTo-Json -Depth 10
        $containersJson | Should -Match 'users' -Because "Users container must exist"
        $containersJson | Should -Match 'profiles' -Because "Profiles container must exist"
        $containersJson | Should -Match 'connections' -Because "Connections container must exist"
    }
    
    It 'Users container must use /id as partition key' {
        $usersContainer = $compiledJson.resources | Where-Object { 
            $_.type -eq 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers' -and
            $_.name -match 'users'
        }
        
        $partitionKey = $usersContainer.properties.resource.partitionKey.paths[0]
        $partitionKey | Should -Be '/id' -Because "Users container requires /id partition key"
    }
    
    It 'Profiles container must use /userId as partition key' {
        $profilesContainer = $compiledJson.resources | Where-Object { 
            $_.type -eq 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers' -and
            $_.name -match 'profiles'
        }
        
        $partitionKey = $profilesContainer.properties.resource.partitionKey.paths[0]
        $partitionKey | Should -Be '/userId' -Because "Profiles container requires /userId partition key"
    }
    
    It 'Must define RBAC role assignment for Managed Identity' {
        $roleAssignment = $compiledJson.resources | Where-Object { 
            $_.type -eq 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments' 
        }
        
        $roleAssignment | Should -Not -BeNullOrEmpty -Because "Managed Identity needs RBAC access to Cosmos DB"
        
        # Verify it references the cosmosDbDataContributorRoleId variable
        $roleDefJson = $roleAssignment.properties.roleDefinitionId | ConvertTo-Json
        $roleDefJson | Should -Match 'cosmosDbDataContributorRoleId' -Because "Must reference the Cosmos DB Data Contributor role variable"
        
        # Verify the variable is defined with correct GUID
        $variableJson = $compiledJson.variables | ConvertTo-Json -Depth 5
        $variableJson | Should -Match '00000000-0000-0000-0000-000000000002' -Because "Role ID must be Cosmos DB Built-in Data Contributor"
    }
    
    It 'Must store Cosmos DB connection string in Key Vault' {
        $connectionStringSecret = $compiledJson.resources | Where-Object { 
            $_.type -eq 'Microsoft.KeyVault/vaults/secrets' -and
            $_.name -match 'COSMOS-DB-CONNECTION-STRING'
        }
        
        $connectionStringSecret | Should -Not -BeNullOrEmpty -Because "Connection string must be stored securely"
        $connectionStringSecret.properties.value | Should -Match 'listConnectionStrings' -Because "Must use listConnectionStrings() function"
    }
    
    It 'Must store Cosmos DB endpoint in Key Vault' {
        $endpointSecret = $compiledJson.resources | Where-Object { 
            $_.type -eq 'Microsoft.KeyVault/vaults/secrets' -and
            $_.name -match 'COSMOS-DB-ENDPOINT'
        }
        
        $endpointSecret | Should -Not -BeNullOrEmpty -Because "Endpoint must be stored in Key Vault"
    }
    
    It 'Must configure Static Web App with environment variables' {
        $swaConfig = $compiledJson.resources | Where-Object { 
            $_.type -eq 'Microsoft.Web/staticSites/config' -and
            $_.name -match 'appsettings'
        }
        
        $swaConfig | Should -Not -BeNullOrEmpty -Because "Static Web App needs environment variables"
        $swaConfig.properties.COSMOS_DB_ENDPOINT | Should -Not -BeNullOrEmpty
        $swaConfig.properties.COSMOS_DB_DATABASE_NAME | Should -Not -BeNullOrEmpty
        $swaConfig.properties.KEY_VAULT_URI | Should -Not -BeNullOrEmpty
        $swaConfig.properties.MANAGED_IDENTITY_CLIENT_ID | Should -Not -BeNullOrEmpty
    }
    
    It 'Key Vault must have soft delete enabled' {
        $keyVault = $compiledJson.resources | Where-Object { 
            $_.type -eq 'Microsoft.KeyVault/vaults' 
        }
        
        $keyVault.properties.enableSoftDelete | Should -Be $true -Because "Soft delete prevents accidental secret loss"
    }
    
    It 'Must output Cosmos DB connection details' {
        $compiledJson.outputs.cosmosDbEndpoint | Should -Not -BeNullOrEmpty
        $compiledJson.outputs.cosmosDbAccountName | Should -Not -BeNullOrEmpty
        $compiledJson.outputs.cosmosDbDatabaseName | Should -Not -BeNullOrEmpty
    }
}

Describe 'PowerShell Module Functionality' {
    
    BeforeAll {
        . $PSScriptRoot/Initialize-Infra.ps1
    }
    
    It 'Initialize-Infra function must be defined' {
        $cmd = Get-Command Initialize-Infra -ErrorAction SilentlyContinue
        $cmd | Should -Not -BeNullOrEmpty -Because "Initialize-Infra function is required"
    }
    
    It 'Must require Environment parameter' {
        $cmd = Get-Command Initialize-Infra
        $envParam = $cmd.Parameters['Environment']
        
        $envParam.Attributes | Where-Object { $_ -is [Parameter] } | 
            ForEach-Object { $_.Mandatory } | Should -Contain $true -Because "Environment must be mandatory"
    }
    
    It 'Must only allow dev or prod environments' {
        $cmd = Get-Command Initialize-Infra
        $validValues = $cmd.Parameters['Environment'].Attributes | 
            Where-Object { $_ -is [ValidateSet] } | 
            Select-Object -ExpandProperty ValidValues
        
        $validValues | Should -Be @('dev', 'prod') -Because "Only dev and prod environments are allowed"
    }
    
    It 'Must require Az.CosmosDB module' {
        $moduleContent = Get-Content (Join-Path $PSScriptRoot 'Initialize-Infra.ps1') -Raw
        $moduleContent | Should -Match "Az\.CosmosDB" -Because "Cosmos DB operations require Az.CosmosDB module"
    }
}
