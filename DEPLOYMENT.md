# CodePals.io - Azure Deployment Guide

## Required Azure Resources

### 1. Azure Cosmos DB
- **Database Name**: `codepals-db`
- **Containers**:
  - `users` (partition key: `/id`)
  - `profiles` (partition key: `/userId`)
  - `connections` (partition key: `/id`)

### 2. Azure Key Vault
- **Name**: `codepals-dev-kv` (or your chosen name)
- **Secrets Required**: See section below

### 3. Azure Static Web Apps
- **Configuration**: Server mode with @astrojs/node adapter
- **Build Configuration**:
  - Build command: `npm run build`
  - Output location: `dist`
  - App location: `/`

## Required Environment Variables / Key Vault Secrets

### GitHub OAuth
```
GITHUB-CLIENT-ID=<your-github-oauth-app-client-id>
GITHUB-CLIENT-SECRET=<your-github-oauth-app-secret>
GITHUB-CALLBACK-URL=https://your-domain.azurestaticapps.net/api/auth/callback
```

**Setup**:
1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create a new OAuth App
3. Set Authorization callback URL to your callback URL
4. Copy Client ID and generate a Client Secret

### Database Connection
```
COSMOS-DB-CONNECTION-STRING=AccountEndpoint=https://your-cosmos-account.documents.azure.com:443/;AccountKey=your-key;
COSMOS-DB-DATABASE-NAME=codepals-db
```

**Setup**:
1. Go to Azure Cosmos DB account > Settings > Keys
2. Copy PRIMARY CONNECTION STRING
3. Database name should match what you created

### JWT Secret
```
JWT-SECRET=<generate-a-long-random-string-at-least-32-characters>
```

**Generate**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Azure Key Vault (Optional for Production)
```
AZURE-KEYVAULT-URL=https://your-keyvault.vault.azure.net/
```

**Note**: For local development, use `.env.local` with `ENVIRONMENT=dev`. For production deployments, the app will automatically use Azure Key Vault if `ENVIRONMENT` is not set to `dev`.

### SendGrid (For Future Email Verification)
```
CODEPALS-SENDGRID-DEV-KEY=<your-sendgrid-api-key>
```

**Setup**:
1. Create SendGrid account
2. Go to Settings > API Keys
3. Create an API key with Mail Send permissions

## Local Development Setup

1. **Create `.env.local` file**:
```env
ENVIRONMENT=dev
AZURE_KEYVAULT_URL=https://your-keyvault.vault.azure.net/

# GitHub OAuth
GITHUB_CLIENT_ID=your-dev-client-id
GITHUB_CLIENT_SECRET=your-dev-client-secret
GITHUB_CALLBACK_URL=http://localhost:4321/api/auth/callback

# JWT
JWT_SECRET=your-local-jwt-secret

# Cosmos DB
COSMOS_DB_CONNECTION_STRING=your-connection-string
COSMOS_DB_DATABASE_NAME=codepals-db

# SendGrid (optional)
CODEPALS_SENDGRID_DEV_KEY=your-sendgrid-key
```

2. **Install dependencies**:
```bash
npm install
```

3. **Run development server**:
```bash
npm run dev
```

## Azure Static Web Apps Deployment

### Method 1: GitHub Actions (Recommended)

1. **Configure Application Settings** in Azure Portal:
   - Go to your Static Web App > Configuration > Application settings
   - Add each environment variable (use underscores instead of dashes):
     ```
     GITHUB_CLIENT_ID
     GITHUB_CLIENT_SECRET
     GITHUB_CALLBACK_URL
     JWT_SECRET
     COSMOS_DB_CONNECTION_STRING
     COSMOS_DB_DATABASE_NAME
     AZURE_KEYVAULT_URL
     ```

2. **Update `staticwebapp.config.json`** (if needed):
```json
{
  "platform": {
    "apiRuntime": "node:20"
  },
  "routes": [],
  "navigationFallback": {
    "rewrite": "/404.html"
  }
}
```

3. **Push to GitHub** - deployment will trigger automatically

### Method 2: Azure Key Vault (Production)

For production, secrets should be stored in Azure Key Vault:

1. **Add Managed Identity** to Static Web App:
   - Go to Static Web App > Settings > Identity
   - Enable System-assigned managed identity
   - Copy Object (principal) ID

2. **Grant Key Vault Access**:
   - Go to Key Vault > Access policies
   - Add access policy:
     - Secret permissions: Get, List
     - Select principal: Paste your Static Web App's managed identity ID

3. **Add Secrets to Key Vault** (with dashes):
   ```
   GITHUB-CLIENT-ID
   GITHUB-CLIENT-SECRET
   GITHUB-CALLBACK-URL
   JWT-SECRET
   COSMOS-DB-CONNECTION-STRING
   COSMOS-DB-DATABASE-NAME
   CODEPALS-SENDGRID-DEV-KEY
   ```

4. **Configure Static Web App**:
   - Only set `AZURE_KEYVAULT_URL` in application settings
   - Remove `ENVIRONMENT` variable (or set to anything except "dev")
   - App will automatically fetch secrets from Key Vault

## Authentication Flow

### DefaultAzureCredential Chain
The app uses `@azure/identity` DefaultAzureCredential which tries:
1. **Managed Identity** (Production in Azure)
2. **Azure CLI** (Local development if signed in with `az login`)
3. **Azure PowerShell** (Local development if signed in with `Connect-AzAccount`)
4. **Environment Variables** (Fallback)

### Local Development
- Set `ENVIRONMENT=dev` in `.env.local`
- App reads from local environment variables
- No Azure authentication needed for local dev

### Production
- Don't set `ENVIRONMENT` variable (or set to "production")
- App uses DefaultAzureCredential to access Key Vault
- Managed Identity handles authentication automatically

## Testing Deployment

### Before Deploying

1. **Test locally**:
```bash
npm run dev
# Visit http://localhost:4321
# Test sign-in flow
# Test profile creation/editing
```

2. **Build test**:
```bash
npm run build
npm run preview
```

### After Deploying

1. **Test OAuth callback URL**:
   - Ensure GitHub OAuth app has correct callback URL
   - Test sign-in flow

2. **Test database connection**:
   - Sign in and create profile
   - Verify data appears in Cosmos DB

3. **Test Key Vault (if using)**:
   - Check application logs for Key Vault access
   - Verify secrets are loaded correctly

## Troubleshooting

### OAuth Issues
- Verify callback URL matches exactly (including https://)
- Check GitHub OAuth app settings
- Ensure CLIENT_ID and CLIENT_SECRET are correct

### Database Connection Errors
- Verify connection string is complete and correct
- Check Cosmos DB firewall settings (allow Azure services)
- Ensure database and containers exist

### Key Vault Access Denied
- Verify managed identity is enabled
- Check Key Vault access policies
- Ensure secret names match (use dashes in Key Vault, underscores in env vars)

### Configuration Service
The app includes `/api/config/test` endpoint to verify configuration:
```bash
curl https://your-app.azurestaticapps.net/api/config/test
```

Returns:
```json
{
  "configSource": "Azure Key Vault" or "Environment Variables",
  "keyvaultUrl": "https://...",
  "secretsLoaded": ["SECRET-1", "SECRET-2", ...]
}
```

## Security Best Practices

1. **Never commit `.env.local`** - already in `.gitignore`
2. **Use Key Vault for production** secrets
3. **Rotate secrets regularly** (JWT, GitHub OAuth)
4. **Enable Cosmos DB firewall** - allow only Azure services + your IP
5. **Use HTTPS only** in production
6. **Enable Static Web App custom domain** with SSL

## Monitoring

- **Application Insights**: Enable in Static Web App settings
- **Cosmos DB Metrics**: Monitor RU consumption
- **Key Vault Logs**: Enable diagnostic settings for secret access
- **Static Web App Logs**: Check deployment and runtime logs

## Cost Optimization

- **Cosmos DB**: Use serverless tier for development
- **Static Web Apps**: Free tier includes 100 GB bandwidth/month
- **Key Vault**: Standard tier is $0.03/10k operations

## Next Steps After Deployment

1. Configure custom domain
2. Set up Application Insights
3. Enable email verification (SendGrid)
4. Implement user search functionality
5. Add connection/matching system
6. Set up CI/CD pipeline with tests
