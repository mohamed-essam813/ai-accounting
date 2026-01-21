# FX Rates Setup Guide

This guide explains how to set up automatic FX rate updates for currency conversion.

## Overview

The system automatically fetches and stores foreign exchange rates from external APIs. Rates are:
- **Fetched on-demand** when needed (if not in database)
- **Updated daily** via scheduled cron job
- **Stored in database** for fast lookups

## Supported Providers

### 1. ExchangeRate-API (Recommended for Free Tier)
- **Free Tier**: 1,500 requests/month, no API key needed
- **Paid Tier**: Higher limits, API key required
- **Sign up**: https://www.exchangerate-api.com/
- **Best for**: Development, small businesses

### 2. Fixer.io (Recommended for Production)
- **Paid**: Most reliable, real-time rates
- **Sign up**: https://fixer.io/
- **Best for**: Production environments, high-volume usage

### 3. CurrencyAPI
- **Free Tier**: 300 requests/month
- **Paid Tier**: Higher limits
- **Sign up**: https://currencyapi.com/
- **Best for**: Alternative option

## Setup Instructions

### Step 1: Choose a Provider

For **development/testing**: Use ExchangeRate-API (no key needed)
For **production**: Use Fixer.io (paid, most reliable)

### Step 2: Get API Key (if needed)

1. **ExchangeRate-API**:
   - Visit https://www.exchangerate-api.com/
   - Sign up for free account
   - Get API key from dashboard
   - Free tier: 1,500 requests/month

2. **Fixer.io**:
   - Visit https://fixer.io/
   - Sign up and choose plan
   - Get API key from dashboard
   - Recommended for production

3. **CurrencyAPI**:
   - Visit https://currencyapi.com/
   - Sign up for free account
   - Get API key from dashboard
   - Free tier: 300 requests/month

### Step 3: Add API Key to Environment Variables

Add to your `.env.local` file:

```bash
# For ExchangeRate-API (optional - works without key for free tier)
EXCHANGERATE_API_KEY=your_key_here

# For Fixer.io (recommended for production)
FIXER_API_KEY=your_key_here

# For CurrencyAPI
CURRENCYAPI_KEY=your_key_here
```

**Note**: The system will automatically use the first available provider in this order:
1. Fixer.io (if `FIXER_API_KEY` is set)
2. CurrencyAPI (if `CURRENCYAPI_KEY` is set)
3. ExchangeRate-API (works without key, but better with key)

### Step 4: Deploy to Vercel

If deploying to Vercel, add the environment variables in:
1. Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add each API key for Production, Preview, and Development environments

### Step 5: Set Up Scheduled Updates (Vercel)

The `vercel.json` file is already configured to update rates daily at 2 AM UTC.

**For Vercel Pro/Enterprise**:
- Cron jobs run automatically
- No additional setup needed

**For Vercel Free/Hobby**:
- Cron jobs require Vercel Pro plan
- Alternative: Use external cron service (see below)

### Step 6: Test the Setup

1. **Manual Update** (for testing):
   ```bash
   curl -X POST https://your-app.vercel.app/api/fx-rates/update \
     -H "Content-Type: application/json" \
     -d '{"tenantId": "your-tenant-id"}'
   ```

2. **Check Status**:
   ```bash
   curl https://your-app.vercel.app/api/fx-rates/update
   ```

## Alternative: External Cron Service

If you're on Vercel Free tier, use an external cron service:

### Option 1: Cron-Job.org (Free)
1. Sign up at https://cron-job.org/
2. Create new cron job:
   - **URL**: `https://your-app.vercel.app/api/fx-rates/update`
   - **Schedule**: Daily at 2 AM UTC
   - **Method**: POST
   - **Body**: `{}` (empty JSON)

### Option 2: EasyCron (Free tier available)
1. Sign up at https://www.easycron.com/
2. Create cron job pointing to your API endpoint

### Option 3: Supabase Edge Functions
1. Create Supabase Edge Function
2. Schedule with Supabase Cron
3. Call your API endpoint

## How It Works

### Automatic Rate Fetching

1. **On-Demand Fetching**:
   - When a currency conversion is needed
   - If rate not found in database
   - System automatically fetches from API
   - Stores in database for future use

2. **Scheduled Updates**:
   - Daily cron job runs at 2 AM UTC
   - Fetches latest rates for all tenants
   - Updates database with new rates

3. **Rate Storage**:
   - Rates stored per tenant, per currency pair, per date
   - Historical rates preserved
   - Fast lookups from database

### Rate Lookup Priority

1. Check database for existing rate
2. If not found and `fetchIfMissing=true`, fetch from API
3. Store in database
4. Return rate
5. Fallback to 1:1 if all else fails (should not happen)

## Monitoring

### Check Rate Update Status

```bash
GET /api/fx-rates/update
```

Returns:
```json
{
  "tenantId": "uuid",
  "lastUpdate": "2026-01-19",
  "isStale": false
}
```

### Manual Update

```bash
POST /api/fx-rates/update
Content-Type: application/json

{
  "tenantId": "optional-tenant-id",
  "provider": "exchangerate-api" | "fixer" | "currencyapi",
  "date": "2026-01-19" // optional, defaults to today
}
```

## Troubleshooting

### Rates Not Updating

1. **Check API Key**: Ensure API key is set correctly
2. **Check Provider**: Verify provider is available and not rate-limited
3. **Check Logs**: Look for errors in Vercel logs
4. **Test Manually**: Try manual update via API endpoint

### Rate Limits Exceeded

1. **Upgrade Plan**: Consider paid tier for higher limits
2. **Switch Provider**: Try different provider
3. **Reduce Frequency**: Update less frequently (e.g., weekly instead of daily)

### Rates Seem Incorrect

1. **Check Date**: Ensure correct date is being used
2. **Check Currency Codes**: Verify currency codes are correct (USD, EUR, etc.)
3. **Check Provider**: Some providers have different rate sources

## Best Practices

1. **Production**: Use Fixer.io for reliability
2. **Development**: ExchangeRate-API free tier is sufficient
3. **Update Frequency**: Daily updates are usually sufficient
4. **Monitor**: Check rate update status regularly
5. **Backup**: Keep historical rates for reporting

## Cost Estimates

- **ExchangeRate-API Free**: $0/month (1,500 requests)
- **ExchangeRate-API Paid**: $9.99/month (unlimited)
- **Fixer.io Basic**: $10/month (1,000 requests)
- **CurrencyAPI Free**: $0/month (300 requests)
- **CurrencyAPI Paid**: $9.99/month (1,000 requests)

For most use cases, **ExchangeRate-API free tier** is sufficient for development, and **Fixer.io** is recommended for production.

## Support

If you encounter issues:
1. Check API provider status pages
2. Review Vercel logs
3. Test API endpoint manually
4. Verify environment variables are set correctly
