<#
.SYNOPSIS
Initialize GitHub OAuth application for CodePals.io

.DESCRIPTION
Creates or updates a GitHub OAuth application using GitHub CLI (gh).
Outputs client ID and secret for use in Azure Static Web App environment variables.

.EXAMPLE
. ./Initialize-GitHubOAuth.ps1
Initialize-GitHubOAuth -Environment dev -CallbackUrl "https://dev.codepals.io/api/auth/callback"

.EXAMPLE
Initialize-GitHubOAuth -Environment prod -CallbackUrl "https://codepals.io/api/auth/callback"
#>

function Initialize-GitHubOAuth {
    <#
    .SYNOPSIS
    Initialize GitHub OAuth app for CodePals.io
    
    .PARAMETER Environment
    'dev' or 'prod'
    
    .PARAMETER CallbackUrl
    OAuth callback URL (defaults to environment-based URL)
    
    .PARAMETER AppName
    OAuth app name (defaults to "CodePals.io - {Environment}")
    #>
    
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('dev', 'prod')]
        [string]$Environment,

        [Parameter(Mandatory = $false)]
        [string]$CallbackUrl,

        [Parameter(Mandatory = $false)]
        [string]$AppName
    )

    $ErrorActionPreference = 'Stop'
    $WarningPreference = 'SilentlyContinue'

    Write-Host "🔐 Initializing GitHub OAuth for CodePals.io" -ForegroundColor Cyan
    Write-Host "Environment: $Environment" -ForegroundColor Green

    # Set defaults based on environment
    if (-not $CallbackUrl) {
        $CallbackUrl = if ($Environment -eq 'dev') {
            'https://dev.codepals.io/api/auth/callback'
        } else {
            'https://codepals.io/api/auth/callback'
        }
    }

    if (-not $AppName) {
        $AppName = "CodePals.io - $($Environment.ToUpper())"
    }

    $HomepageUrl = if ($Environment -eq 'dev') {
        'https://dev.codepals.io'
    } else {
        'https://codepals.io'
    }

    # 1. Check GitHub CLI installation
    Write-Host "`n→ Checking GitHub CLI installation..."
    try {
        $ghVersion = gh --version 2>&1 | Select-Object -First 1
        Write-Host "   ✓ GitHub CLI installed: $ghVersion" -ForegroundColor Green
    }
    catch {
        Write-Host "   ❌ GitHub CLI not installed" -ForegroundColor Red
        Write-Host "`nPlease install GitHub CLI: https://cli.github.com/" -ForegroundColor Yellow
        Write-Host "   macOS: brew install gh" -ForegroundColor Cyan
        Write-Host "   Windows: winget install --id GitHub.cli" -ForegroundColor Cyan
        Write-Host "   Linux: See https://github.com/cli/cli/blob/trunk/docs/install_linux.md" -ForegroundColor Cyan
        exit 1
    }

    # 2. Check GitHub authentication
    Write-Host "→ Checking GitHub authentication..."
    try {
        $authStatus = gh auth status 2>&1
        Write-Host "   ✓ Authenticated to GitHub" -ForegroundColor Green
    }
    catch {
        Write-Host "   ❌ Not authenticated to GitHub" -ForegroundColor Red
        Write-Host "`nPlease authenticate: gh auth login" -ForegroundColor Yellow
        exit 1
    }

    # 3. Check if OAuth app already exists
    Write-Host "`n→ Checking for existing OAuth app: $AppName"
    try {
        # List existing OAuth apps (requires GitHub API call)
        # Note: gh CLI doesn't have native OAuth app management yet, so we use API directly
        $existingApps = gh api /user/applications -q ".[].name" 2>&1
        
        if ($existingApps -contains $AppName) {
            Write-Host "   ⚠ OAuth app '$AppName' already exists" -ForegroundColor Yellow
            $update = Read-Host "Update existing app? (y/n)"
            if ($update -ne 'y') {
                Write-Host "   Skipping OAuth app creation" -ForegroundColor Yellow
                return
            }
        }
    }
    catch {
        Write-Host "   No existing app found (this is normal for first run)" -ForegroundColor Cyan
    }

    # 4. Create OAuth app using GitHub API
    Write-Host "`n→ Creating GitHub OAuth application..."
    Write-Host "   Name: $AppName"
    Write-Host "   Homepage: $HomepageUrl"
    Write-Host "   Callback URL: $CallbackUrl"

    try {
        # Create OAuth app via GitHub API
        # Note: GitHub CLI doesn't expose OAuth app creation directly
        # We need to use the REST API through gh api
        
        $oauthAppPayload = @{
            name = $AppName
            url = $HomepageUrl
            callback_url = $CallbackUrl
        } | ConvertTo-Json

        Write-Host "`n⚠ Manual step required:" -ForegroundColor Yellow
        Write-Host "GitHub CLI doesn't support automated OAuth app creation yet." -ForegroundColor Yellow
        Write-Host "`nPlease create the OAuth app manually:" -ForegroundColor Cyan
        Write-Host "1. Go to: https://github.com/settings/developers" -ForegroundColor White
        Write-Host "2. Click 'New OAuth App'" -ForegroundColor White
        Write-Host "3. Use these values:" -ForegroundColor White
        Write-Host "   - Application name: $AppName" -ForegroundColor White
        Write-Host "   - Homepage URL: $HomepageUrl" -ForegroundColor White
        Write-Host "   - Authorization callback URL: $CallbackUrl" -ForegroundColor White
        Write-Host "4. Click 'Register application'" -ForegroundColor White
        Write-Host "5. Copy the Client ID and generate a Client Secret" -ForegroundColor White
        
        if (-not $PSCmdlet.ShouldProcess($Environment, "Configure GitHub OAuth and store secrets in Key Vault")) {
            Write-Host "`n[WhatIf] Would:" -ForegroundColor Yellow
            Write-Host "  - Prompt for GitHub OAuth credentials" -ForegroundColor Yellow
            Write-Host "  - Generate JWT secret" -ForegroundColor Yellow
            Write-Host "  - Store secrets in codepals-$Environment-kv" -ForegroundColor Yellow
            return
        }

        Write-Host "`n→ After creating the app, enter the credentials below:" -ForegroundColor Cyan
        $clientId = Read-Host "Client ID"
        $clientSecret = Read-Host "Client Secret (will not be displayed)" -AsSecureString
        $clientSecretPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($clientSecret)
        )

        Write-Host "`n✅ OAuth app configured!" -ForegroundColor Green

        # 5. Generate a random JWT secret
        $jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})

        # 6. Store secrets in Azure Key Vault
        Write-Host "`n→ Storing secrets in Azure Key Vault..."
        $KeyVaultName = "codepals-$Environment-kv"

        try {
            # Store GitHub Client ID
            $clientIdSecret = ConvertTo-SecureString -String $clientId -AsPlainText -Force
            Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "GITHUB-CLIENT-ID" -SecretValue $clientIdSecret -Verbose:$false | Out-Null
            Write-Host "   ✓ Stored GITHUB-CLIENT-ID" -ForegroundColor Green

            # Store GitHub Client Secret
            $clientSecretSecure = ConvertTo-SecureString -String $clientSecretPlain -AsPlainText -Force
            Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "GITHUB-CLIENT-SECRET" -SecretValue $clientSecretSecure -Verbose:$false | Out-Null
            Write-Host "   ✓ Stored GITHUB-CLIENT-SECRET" -ForegroundColor Green

            # Store JWT Secret
            $jwtSecretSecure = ConvertTo-SecureString -String $jwtSecret -AsPlainText -Force
            Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "JWT-SECRET" -SecretValue $jwtSecretSecure -Verbose:$false | Out-Null
            Write-Host "   ✓ Stored JWT-SECRET" -ForegroundColor Green

            # Store OAuth app metadata
            $metadataJson = @{
                appName = $AppName
                homepageUrl = $HomepageUrl
                callbackUrl = $CallbackUrl
                environment = $Environment
                createdDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
            } | ConvertTo-Json
            $metadataSecure = ConvertTo-SecureString -String $metadataJson -AsPlainText -Force
            Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "GITHUB-OAUTH-METADATA" -SecretValue $metadataSecure -Verbose:$false | Out-Null
            Write-Host "   ✓ Stored OAuth app metadata" -ForegroundColor Green

        }
        catch {
            Write-Host "   ❌ Failed to store secrets in Key Vault: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "`n⚠ Secrets not stored in Key Vault. Please store manually:" -ForegroundColor Yellow
            Write-Host "GITHUB_CLIENT_ID=$clientId" -ForegroundColor White
            Write-Host "GITHUB_CLIENT_SECRET=$clientSecretPlain" -ForegroundColor White
            Write-Host "JWT_SECRET=$jwtSecret" -ForegroundColor White
            throw
        }

        Write-Host "`n✅ GitHub OAuth setup complete!" -ForegroundColor Green
        Write-Host "`n📋 Summary:" -ForegroundColor Cyan
        Write-Host "   OAuth App: $AppName" -ForegroundColor White
        Write-Host "   Homepage: $HomepageUrl" -ForegroundColor White
        Write-Host "   Callback: $CallbackUrl" -ForegroundColor White
        Write-Host "   Key Vault: $KeyVaultName" -ForegroundColor White

        Write-Host "`n🔑 Secrets stored in Key Vault:" -ForegroundColor Cyan
        Write-Host "   - GITHUB-CLIENT-ID" -ForegroundColor White
        Write-Host "   - GITHUB-CLIENT-SECRET" -ForegroundColor White
        Write-Host "   - JWT-SECRET" -ForegroundColor White
        Write-Host "   - GITHUB-OAUTH-METADATA" -ForegroundColor White

        Write-Host "`n📝 Next steps:" -ForegroundColor Cyan
        Write-Host "1. Configure Static Web App to read from Key Vault" -ForegroundColor White
        Write-Host "2. Grant Static Web App managed identity access to Key Vault" -ForegroundColor White
        Write-Host "3. Deploy the authentication endpoints" -ForegroundColor White
        Write-Host "4. Test the OAuth flow: $HomepageUrl/api/auth/login" -ForegroundColor White

        # Return credentials for programmatic use (without exposing plaintext)
        return @{
            ClientId = $clientId
            AppName = $AppName
            CallbackUrl = $CallbackUrl
            KeyVaultName = $KeyVaultName
            Environment = $Environment
        }
    }
    catch {
        Write-Host "   ❌ Failed to configure OAuth app" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}
