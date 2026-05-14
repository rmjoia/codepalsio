# Azure Static Web Apps Setup Guide

## Overview

This guide shows you how to configure Azure Static Web Apps with **secure, built-in GitHub authentication** on the **Free tier**. No custom OAuth code, no GitHub OAuth app of your own, no Standard-tier costs — Azure handles everything via its pre-configured GitHub provider.

---

## Prerequisites

1. Azure subscription
2. GitHub account
3. GitHub repository with CodePals.io code

---

## Step 1: Authentication — Pre-configured GitHub provider (recommended, Free tier)

On the **Free** plan, SWA ships with a pre-configured GitHub OAuth app maintained by Microsoft. Users click "Sign in with GitHub", authorize "Azure Static Web Apps" on the consent screen, and come back signed in. **You don't need to register your own GitHub OAuth app.** Skip ahead to Step 2.

### Optional: bring your own OAuth app (Standard tier only)

You only need a custom GitHub OAuth app if you want the consent screen to say "CodePals" instead of "Azure Static Web Apps", or you need extra OAuth scopes. This requires the **Standard** plan (~$9/app/month) and is **not recommended** for low-budget setups. If you do want it:

1. Go to **GitHub Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**
2. Application name: `CodePals.io`
3. Homepage URL: `https://codepals.io` (your custom domain or the default `<name>.azurestaticapps.net`)
4. Authorization callback URL: `https://<your-swa-host>/.auth/login/github/callback`
5. Save the Client ID and generate a Client Secret
6. In Azure: set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` as SWA app settings
7. Add `auth.identityProviders.github.registration` referencing those setting names in `staticwebapp.config.json`
8. Flip the SWA SKU to Standard

> Keep the Client Secret out of source control.

---

## Step 2: Create Azure Static Web App

### 2.1 Create Resource in Azure Portal

1. Log in to [Azure Portal](https://portal.azure.com)
2. Click **Create a resource** → Search for **Static Web App**
3. Click **Create**

### 2.2 Configure Basic Settings

**Basics Tab:**
- **Subscription**: Select your subscription
- **Resource Group**: Create new or use existing (e.g., `codepals-resources`)
- **Name**: `codepals` (or your preferred name)
  - This becomes your URL: `https://codepals.azurestaticapps.net`
- **Plan type**: **Free** (recommended). Standard is only needed if you want custom auth registration, `rolesSource` function-based roles, or a paid SLA — none of which CodePals requires.
- **Region**: Choose closest to your users
- **Source**: **GitHub**

### 2.3 Configure GitHub Deployment

**Deployment details:**
- Click **Sign in with GitHub**
- Authorize Azure Static Web Apps
- **Organization**: Select your GitHub account/org
- **Repository**: `codepalsio`
- **Branch**: `main` (or your deployment branch)

**Build Details:**
- **Build Presets**: Select **Custom**
- **App location**: `/` (repository root)
- **Api location**: `api`
- **Output location**: `dist`

### 2.4 Review and Create

1. Click **Review + create**
2. Review all settings
3. Click **Create**
4. Wait for deployment to complete (~2-3 minutes)

---

## Step 3: Configure Application Settings

After the Static Web App is created, configure environment variables.

### 3.1 Navigate to Configuration

1. Go to your Static Web App resource in Azure Portal
2. Click **Configuration** in the left menu
3. Click **Application settings** tab

### 3.2 Add Environment Variables

Click **+ Add** for each of the following:

| Name | Value | Notes |
|------|-------|-------|
| `COSMOS_DB_CONNECTION_STRING` | `AccountEndpoint=https://...` | Your Cosmos DB connection string |
| `COSMOS_DB_DATABASE_NAME` | `codepals-db` | Your database name |
| `ENVIRONMENT` | `dev` or `prod` | Used by the API + admin bootstrap |
| `ADMIN_GITHUB_LOGINS` | `your-github-login` | Comma-separated. First admin(s) get bootstrapped on first sign-in; after that the persistent roster (Cosmos) is authoritative. |

> **Free tier note:** `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` are **NOT** needed when using the pre-configured GitHub provider. Only set those (and the corresponding `auth.identityProviders` config) if you've opted into custom registration on Standard tier (Step 1 optional path).

> 💡 **Tip**: Use Azure Key Vault for production secrets (see advanced security section)

### 3.3 Save Configuration

1. Click **Save** at the top
2. Wait for the configuration to apply (~30 seconds)

---

## Step 4: Update GitHub OAuth App Callback URL (Standard tier only)

**Skip this step if you're on Free tier.** Microsoft's pre-configured GitHub OAuth app already has the right callback registered — you don't own that app and can't (and don't need to) change it.

If you opted into custom registration (Step 1 optional path) on Standard tier:

1. Go back to **GitHub Settings** → **Developer settings** → **OAuth Apps**
2. Click on your CodePals.io app
3. Update the URLs:
   - **Homepage URL**: your actual URL (e.g. `https://codepals.io`)
   - **Authorization callback URL**: `https://<your-swa-host>/.auth/login/github/callback`
4. Click **Update application**

---

## Step 5: Configure Cosmos DB

### 5.1 Create Cosmos DB Account

1. In Azure Portal, click **Create a resource** → **Azure Cosmos DB**
2. Select **NoSQL** API
3. Configure:
   - **Resource Group**: Same as Static Web App
   - **Account Name**: `codepals-db` (globally unique)
   - **Location**: Same region as Static Web App
   - **Capacity mode**: **Serverless** (for development) or **Provisioned throughput**
4. Click **Review + create** → **Create**

### 5.2 Create Database and Containers

1. Go to your Cosmos DB account
2. Click **Data Explorer**
3. Click **New Database**
   - **Database id**: `codepals-db`
   - Click **OK**
4. Create **users** container:
   - Click **New Container**
   - **Database id**: Use existing `codepals-db`
   - **Container id**: `users`
   - **Partition key**: `/id`
   - Click **OK**
5. Create **profiles** container:
   - Click **New Container**
   - **Database id**: Use existing `codepals-db`
   - **Container id**: `profiles`
   - **Partition key**: `/userId`
   - Click **OK**

### 5.3 Get Connection String

1. In Cosmos DB account, click **Keys** (left menu)
2. Copy **PRIMARY CONNECTION STRING**
3. Add this to your Static Web App's Application Settings (see Step 3.2)

---

## Step 6: Configure Network Security (Optional but Recommended)

### 6.1 Restrict Cosmos DB Access

1. In Cosmos DB account, click **Networking**
2. Select **Selected networks**
3. Add exception:
   - ✅ **Allow access from Azure Portal**
   - ✅ **Allow access from Azure datacenters**
4. Click **Save**

> 💡 This restricts database access to Azure services only

---

## Step 7: Test the Deployment

### 7.1 Access Your Site

1. Go to your Static Web App in Azure Portal
2. Click **Browse** or visit `https://codepals.azurestaticapps.net`

### 7.2 Test Authentication

1. Click **Login** on the homepage
2. You should be redirected to GitHub
3. Authorize the application
4. You should be redirected back to your site, logged in
5. Try accessing `/profile` - you should see the profile page
6. Click **Logout** - you should be logged out

### 7.3 Test API Endpoints

```bash
# Test configuration endpoint (should work without auth)
curl https://codepals.azurestaticapps.net/api/config-test

# Test profile save (requires authentication - should return 401)
curl -X POST https://codepals.azurestaticapps.net/api/profile-save \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Test","bio":"Test bio"}'
```

---

## Step 8: Configure Custom Domain (Optional)

### 8.1 Add Custom Domain

1. In Static Web App, click **Custom domains**
2. Click **+ Add**
3. Select **Custom domain on other DNS**
4. Enter your domain: `codepals.io`
5. Follow the DNS verification steps
6. Wait for SSL certificate to be provisioned

### 8.2 Update GitHub OAuth App

Once custom domain is configured:
1. Update the OAuth app's **Homepage URL** to your custom domain (e.g. `https://codepals.io`).
2. Update the **Authorization callback URL** to use the custom domain:
   `https://codepals.io/.auth/login/github/callback`
   (replace `codepals.io` with your custom domain).

---

## Security Best Practices

### ✅ What's Already Secured

- **Authentication**: Managed by Azure, no custom OAuth code
- **CSRF Protection**: Built-in with Azure's auth system
- **Secure Cookies**: HttpOnly, Secure, SameSite managed automatically
- **Input Validation**: Implemented in API functions
- **Connection Pooling**: CosmosClient singleton pattern
- **Security Headers**: Configured in staticwebapp.config.json

### 🔒 Additional Recommendations

#### 1. Use Azure Key Vault (Production)

Instead of storing secrets in Application Settings:

1. Create Azure Key Vault
2. Add secrets to Key Vault
3. Enable System-assigned managed identity on Static Web App
4. Grant Key Vault access to managed identity
5. Reference secrets using Key Vault references:
   ```
   @Microsoft.KeyVault(SecretUri=https://your-vault.vault.azure.net/secrets/github-client-secret/)
   ```

#### 2. Enable Application Insights

1. In Static Web App, click **Application Insights**
2. Click **Turn on Application Insights**
3. Create new or link existing App Insights
4. Monitor authentication failures, API errors, performance

#### 3. Set Up Alerts

1. Go to **Alerts** in Static Web App
2. Create alert rules for:
   - High error rates (>5% 5xx errors)
   - Authentication failures
   - Unusual traffic patterns

#### 4. Regular Secret Rotation

- Rotate GitHub OAuth secret every 90 days
- Rotate Cosmos DB keys every 90 days
- Use Azure Key Vault with automatic rotation

---

## Troubleshooting

### Authentication Not Working

**Problem**: Clicking login doesn't redirect to GitHub (Free tier)
- **Solution**: Verify the SWA tier is actually Free (`az staticwebapp show --name <swa> --query sku.name`). If it's Standard with a stale `auth.identityProviders` block in `staticwebapp.config.json`, the custom registration fails closed.
- **Solution**: Make sure `staticwebapp.config.json` does NOT contain `auth.rolesSource` or `auth.identityProviders` — those are Standard-only features that, when present on Free, can break the redirect.
- **Solution**: Anonymous user route `/_astro/*` must include `["anonymous"]` so the login UI's static assets load.

**Problem**: After GitHub authorization, getting 401 errors on `/api/admin-*` endpoints
- **Solution**: Verify your GitHub login is in `ADMIN_GITHUB_LOGINS` (env var) for the bootstrap path, or in the Cosmos `adminRoster` document after first sign-in. The handler resolves admin status via the roster, NOT via `principal.userRoles` (rolesSource is Standard-only).

**Problem (Standard tier custom registration only)**: 404 after clicking login
- **Solution**: Check that `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set in Application Settings.
- **Solution**: Verify the OAuth app's callback URL matches `https://<your-swa-host>/.auth/login/github/callback` exactly.

### API Calls Failing

**Problem**: `/api/profile-save` returns 401
- **Solution**: Ensure you're logged in via `/.auth/login/github`
- **Solution**: Check that route is protected in `staticwebapp.config.json`

**Problem**: `/api/profile-save` returns 500
- **Solution**: Check Application Settings for `COSMOS_DB_CONNECTION_STRING`
- **Solution**: Verify database and containers exist
- **Solution**: Check Application Insights logs for detailed error

### Database Connection Issues

**Problem**: "Authentication failed" from Cosmos DB
- **Solution**: Verify connection string is complete and correct
- **Solution**: Check Cosmos DB firewall allows Azure services

**Problem**: "Container not found"
- **Solution**: Verify containers `users` and `profiles` exist
- **Solution**: Check database name matches `COSMOS_DB_DATABASE_NAME`

---

## Monitoring & Logs

### View Deployment Logs

1. Go to Static Web App
2. Click **GitHub Action runs** 
3. Click on latest run to see build/deploy logs

### View Application Logs

1. Enable Application Insights (see Security Best Practices)
2. Go to **Logs** in Application Insights
3. Query for errors:
   ```kusto
   traces
   | where severityLevel >= 3
   | order by timestamp desc
   ```

### Monitor Auth Events

1. In Application Insights, go to **Logs**
2. Query authentication events:
   ```kusto
   requests
   | where url contains "/.auth/"
   | order by timestamp desc
   ```

---

## Cost Estimation

### Free Tier (recommended setup)
- **Static Web App**: $0 — Free plan, 100 GB bandwidth/month, pre-configured GitHub auth, 500K function executions/month
- **Cosmos DB**: $0 — Free Tier provisioned (1000 RU/s + 25 GB lifetime free, one account per subscription) OR a few cents/month on serverless for very low traffic
- **Key Vault**: ~$0.10/month for a handful of secrets
- **DNS zones**: $0.50/zone/month (one zone for `codepals.io`, optionally one for `dev.codepals.io`)
- **Total**: ~$1-2/month

### If you flip to Standard tier (NOT recommended unless you need it)
- **Static Web App**: $9/app/month (Standard plan)
- Adds custom auth registration, `rolesSource`, BYO Functions, more staging envs
- Reasons to take this on: corporate SSO via custom OIDC, custom OAuth branding, paid SLA
- **Total**: ~$10-20/month per environment

### Cost levers to know
- **One Cosmos Free Tier per subscription.** If you have prod + dev, only one can be Free Tier — the other goes serverless (cheap at idle but charges per request).
- **Cosmos serverless backup storage** is metered. The default 7-day periodic backup is included free up to 2 copies; continuous backup costs extra.
- **DNS zones** cost the same idle or active. Drop the `dev.codepals.io` zone and use the auto-generated `<name>.azurestaticapps.net` URL for dev if you want to save $0.50/month.

---

## Tearing Down an Environment

To completely remove an environment (resource group + soft-deleted Key Vault), use the `Remove-Infra` PowerShell function:

```powershell
Import-Module ./infra/CodePals.Infra.psd1

# Tear down dev — prompts for confirmation
Remove-Infra -Environment dev

# Tear down prod — requires -Force AND a typed confirmation ('destroy prod')
Remove-Infra -Environment prod -Force
```

This deletes:
- The resource group and every contained resource (SWA, Cosmos, MI, etc.)
- The soft-deleted Key Vault (purged so the name is reusable immediately)

After `Remove-Infra`, you can run `Initialize-Infra -Environment dev` again and reuse all the same names.

> The Bicep template sets `enablePurgeProtection: false` and `softDeleteRetentionInDays: 7` for dev (90 for prod) to enable this teardown/reapply cycle. Don't turn purge protection on unless you have a compliance reason — it would block `Remove-Infra` for the full retention window.

---

## Next Steps

1. ✅ Test authentication flow thoroughly
2. ✅ Set up Application Insights monitoring
3. ✅ Configure custom domain
4. ✅ Enable Azure Key Vault for secrets
5. ✅ Set up staging environment (separate Static Web App)
6. ✅ Configure CI/CD alerts
7. ✅ Document runbook for production incidents

---

## Additional Resources

- [Azure Static Web Apps Documentation](https://learn.microsoft.com/en-us/azure/static-web-apps/)
- [Built-in Authentication](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization)
- [Custom Authentication](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-custom)
- [Cosmos DB Best Practices](https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/best-practices)
- [Security Best Practices](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-overview#security)

---

**Created**: November 23, 2025  
**Last Updated**: November 23, 2025
