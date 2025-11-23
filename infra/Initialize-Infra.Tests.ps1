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
    
    It 'Must define Cosmos DB account with free tier enabled' {
        $cosmosAccount = $compiledJson.resources | Where-Object { 
            $_.type -eq 'Microsoft.DocumentDB/databaseAccounts' 
        }
        
        $cosmosAccount | Should -Not -BeNullOrEmpty -Because "Cosmos DB account must be defined"
        $cosmosAccount.properties.enableFreeTier | Should -Be $true -Because "Free tier must be enabled to avoid costs"
    }
    
    It 'Must define Cosmos DB with serverless capability' {
        $cosmosAccount = $compiledJson.resources | Where-Object { 
            $_.type -eq 'Microsoft.DocumentDB/databaseAccounts' 
        }
        
        $capability = $cosmosAccount.properties.capabilities | Where-Object { $_.name -eq 'EnableServerless' }
        $capability | Should -Not -BeNullOrEmpty -Because "Serverless mode is required for cost efficiency"
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
