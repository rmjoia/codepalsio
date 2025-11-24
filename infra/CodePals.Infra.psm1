<#
.SYNOPSIS
CodePals Infrastructure Management Module

.DESCRIPTION
Main module for managing CodePals infrastructure on Azure.
Imports all infrastructure functions and exposes them for use.
#>

# Get the directory where this module is located
$ModuleRoot = $PSScriptRoot

# Import all function scripts
$FunctionScripts = @(
    'Initialize-Infra.ps1'
    'Initialize-DNS.ps1'
    'Initialize-GitHubOAuth.ps1'
)

foreach ($script in $FunctionScripts) {
    $scriptPath = Join-Path $ModuleRoot $script
    if (Test-Path $scriptPath) {
        . $scriptPath
    } else {
        Write-Warning "Function script not found: $scriptPath"
    }
}

# Export all public functions
Export-ModuleMember -Function @(
    'Initialize-Infra'
    'Initialize-DNS'
    'Initialize-GitHubOAuth'
)
