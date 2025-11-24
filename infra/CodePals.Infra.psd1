@{
    # Script module or binary module file associated with this manifest.
    RootModule = 'CodePals.Infra.psm1'

    # Version number of this module.
    ModuleVersion = '1.0.0'

    # ID used to uniquely identify this module
    GUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

    # Author of this module
    Author = 'CodePals Team'

    # Company or vendor of this module
    CompanyName = 'CodePals.io'

    # Copyright statement for this module
    Copyright = '(c) 2025 CodePals.io. All rights reserved.'

    # Description of the functionality provided by this module
    Description = 'Infrastructure management module for CodePals.io Azure resources. Provides functions for provisioning and configuring Static Web Apps, Key Vaults, Cosmos DB, DNS, and GitHub OAuth.'

    # Minimum version of the PowerShell engine required by this module
    PowerShellVersion = '7.0'

    # Modules that must be imported into the global environment prior to importing this module
    RequiredModules = @(
        @{ ModuleName = 'Az.Resources'; ModuleVersion = '6.0.0' }
        @{ ModuleName = 'Az.KeyVault'; ModuleVersion = '4.0.0' }
        @{ ModuleName = 'Az.ManagedServiceIdentity'; ModuleVersion = '1.0.0' }
        @{ ModuleName = 'Az.Websites'; ModuleVersion = '3.0.0' }
        @{ ModuleName = 'Az.Dns'; ModuleVersion = '1.0.0' }
        @{ ModuleName = 'Az.CosmosDB'; ModuleVersion = '1.0.0' }
    )

    # Functions to export from this module
    FunctionsToExport = @(
        'Initialize-Infra'
        'Initialize-DNS'
        'Initialize-GitHubOAuth'
    )

    # Cmdlets to export from this module
    CmdletsToExport = @()

    # Variables to export from this module
    VariablesToExport = @()

    # Aliases to export from this module
    AliasesToExport = @()

    # Private data to pass to the module specified in RootModule/ModuleToProcess
    PrivateData = @{
        PSData = @{
            # Tags applied to this module
            Tags = @('Azure', 'Infrastructure', 'DevOps', 'IaC', 'CodePals')

            # A URL to the license for this module
            LicenseUri = 'https://github.com/rmjoia/codepalsio/blob/main/LICENSE'

            # A URL to the main website for this project
            ProjectUri = 'https://github.com/rmjoia/codepalsio'

            # ReleaseNotes of this module
            ReleaseNotes = @'
# Version 1.0.0
- Initial release
- Initialize-Infra: Provision complete Azure infrastructure
- Initialize-DNS: Configure DNS records for custom domains
- Initialize-GitHubOAuth: Set up GitHub OAuth applications
'@
        }
    }
}
