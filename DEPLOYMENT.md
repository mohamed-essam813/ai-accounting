# 🚀 Deployment Guide - Free Tier Setup

This guide will help you deploy your AI Accounting Platform to **Vercel** (free tier) with all free services.

## ⚡ Quick Start (If You Already Have Credentials)

If you already have Supabase, OpenAI, and Google Cloud set up in `.env.local`:

1. **Test build locally**: `npm run build`
2. **Push to GitHub** (if not already)
3. **Deploy to Vercel**: 
   - Import repo → Add environment variables from `.env.local` → Deploy
   - Copy these from `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `OPENAI_API_KEY`
   - For `NEXT_PUBLIC_APP_URL`: Use placeholder first, update after deploy
   - For Google Cloud: Convert file path to JSON string (see Step 5)
4. **Run migrations**: Use Supabase Dashboard SQL Editor (see Step 3.3)
5. **Update `NEXT_PUBLIC_APP_URL`**: Set to your Vercel URL after first deploy
6. **Link your user**: Sign up, then link to tenant via SQL (see Step 3.4)

**See detailed steps below for complete instructions.**

---

## 📋 Prerequisites

- GitHub account (free)
- Vercel account (free)
- Supabase account (free tier)
- OpenAI account (free tier available, but limited)

## 🎯 Free Tier Services Overview

| Service | Free Tier Limits | Cost After Free Tier |
|---------|-----------------|---------------------|
| **Vercel** | Unlimited projects, 100GB bandwidth/month | $20/month for Pro |
| **Supabase** | 500MB database, 1GB storage, 2GB bandwidth | $25/month for Pro |
| **OpenAI** | $5 free credits (one-time) | Pay-as-you-go (~$0.005/prompt) |
| **Google Cloud Vision** | 1,000 requests/month free | $1.50 per 1,000 images |

**Total Monthly Cost**: $0 (if you stay within free tiers)

---

## Step 1: Prepare Your Code

### 1.1 Push to GitHub

If you haven't already, push your code to GitHub:

```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/ai-accounting.git
git branch -M main
git push -u origin main
```

### 1.2 Verify Build Works Locally

```bash
npm run build
```

If the build succeeds, you're ready to deploy!

---

## Step 2: Deploy to Vercel

### 2.1 Create Vercel Account

1. Go to [https://vercel.com](https://vercel.com)
2. Click **"Sign Up"**
3. Sign up with GitHub (recommended for easy integration)

### 2.2 Import Your Project

1. In Vercel dashboard, click **"Add New..."** → **"Project"**
2. Import your GitHub repository (`ai-accounting`)
3. Vercel will auto-detect Next.js settings
4. **Don't deploy yet** - we need to set environment variables first

### 2.3 Configure Environment Variables

Before deploying, add all environment variables in Vercel:

1. Go to your project → **Settings** → **Environment Variables**
2. Add each variable below:

#### Required Variables

```
NEXT_PUBLIC_APP_URL
```
- **Value**: `https://your-project-name.vercel.app` (you'll get this after first deploy)
- **Environments**: Production, Preview, Development

```
NEXT_PUBLIC_SUPABASE_URL
```
- **Value**: Your Supabase project URL (from Step 3)
- **Environments**: All

```
NEXT_PUBLIC_SUPABASE_ANON_KEY
```
- **Value**: Your Supabase anon key (from Step 3)
- **Environments**: All

```
SUPABASE_SERVICE_ROLE_KEY
```
- **Value**: Your Supabase service role key (from Step 3)
- **Environments**: Production, Preview (NOT Development - security)

```
SUPABASE_JWT_SECRET
```
- **Value**: Your Supabase JWT secret (from Step 3)
- **Environments**: Production, Preview

```
OPENAI_API_KEY
```
- **Value**: Your OpenAI API key (from Step 4)
- **Environments**: Production, Preview

#### Optional: Google Cloud Vision (for OCR)

If you want OCR features, add:

```
GOOGLE_CLOUD_CREDENTIALS_JSON
```
- **Value**: Your Google Cloud service account JSON as a **single-line string**
- **How to get**: See Step 5 below
- **Environments**: Production, Preview

**Important**: For Vercel, you need the JSON as a string, not a file path. See Step 5 for instructions.

### 2.4 Deploy

1. Click **"Deploy"**
2. Wait for build to complete (~2-3 minutes)
3. Your app will be live at `https://your-project-name.vercel.app`

---

## Step 3: Set Up Supabase (Free Tier)

### 3.1 Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up (free)
3. Click **"New Project"**
4. Choose your organization
5. Fill in:
   - **Name**: `ai-accounting-prod` (or any name)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free
6. Click **"Create new project"**
7. Wait ~2 minutes for project to initialize

### 3.2 Get API Keys

1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep secret!)
   - **JWT Secret** → `SUPABASE_JWT_SECRET` (Settings → API → JWT Settings)

### 3.3 Run Database Migrations

You have two options:

#### Option A: Using Supabase CLI (Recommended)

```bash
# Install Supabase CLI (if not already installed)
# See SETUP_GUIDE.md for installation instructions

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push
```

#### Option B: Using Supabase Dashboard (Easier)

1. Go to Supabase Dashboard → **SQL Editor**
2. Open each migration file from `supabase/migrations/` in order:
   - `202411080001_init.sql`
   - `202411080002_pending_invites.sql`
   - `202411080007_fix_app_users_rls.sql`
   - `202411080008_rag_embeddings.sql`
   - `202411080009_rag_rpc_function.sql`
3. Run each SQL file in the SQL Editor (copy-paste and execute)

### 3.4 Link Your First User

After migrations, you need to link your Supabase Auth user to a tenant:

1. Sign up/login to your app (creates Auth user)
2. Go to Supabase Dashboard → **SQL Editor**
3. Run this SQL (replace `YOUR_EMAIL` with your actual email):

```sql
-- Get your user ID
SELECT id, email FROM auth.users WHERE email = 'YOUR_EMAIL';

-- Create a tenant (replace USER_ID with the id from above)
INSERT INTO tenants (id, name, subscription_tier)
VALUES (gen_random_uuid(), 'My Company', 'free')
RETURNING id;

-- Link user to tenant (replace USER_ID and TENANT_ID)
INSERT INTO app_users (id, tenant_id, email, role)
VALUES (
  'USER_ID_FROM_ABOVE',
  'TENANT_ID_FROM_ABOVE',
  'YOUR_EMAIL',
  'admin'
);
```

Or use the simpler approach - create a tenant first, then sign up:

```sql
-- Create tenant
INSERT INTO tenants (id, name, subscription_tier)
VALUES (gen_random_uuid(), 'My Company', 'free')
RETURNING id, name;
```

Then manually link your user after signup using the SQL above.

---

## Step 4: Set Up OpenAI (Free Tier)

### 4.1 Get API Key

1. Go to [https://platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Go to **API Keys** section
4. Click **"Create new secret key"**
5. Name it (e.g., "AI Accounting Production")
6. Copy the key → Add to Vercel as `OPENAI_API_KEY`

### 4.2 Free Tier Limits

- **Free Credits**: $5 one-time credit (new accounts)
- **After Free Credits**: Pay-as-you-go (~$0.005 per prompt with GPT-4o)
- **Rate Limits**: Lower on free tier

**Note**: For production use, you'll likely need to add a payment method. The free $5 credit is just for testing.

### 4.3 Set Usage Limits (Recommended)

1. Go to **Settings** → **Limits**
2. Set monthly spending limit (e.g., $20)
3. Enable usage alerts

---

## Step 5: Set Up Google Cloud Vision (Optional - for OCR)

### 5.1 Create GCP Project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable **Cloud Vision API**:
   - Go to **APIs & Services** → **Library**
   - Search "Cloud Vision API"
   - Click **Enable**

### 5.2 Create Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **"Create Service Account"**
3. Name: `ai-accounting-vision`
4. Click **"Create and Continue"**
5. Grant role: **"Cloud Vision API User"** (or "Service Account User")
6. Click **"Done"**

### 5.3 Download Credentials

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **"Add Key"** → **"Create new key"**
4. Choose **JSON** format
5. Download the JSON file

### 5.4 Convert to Environment Variable (for Vercel)

For Vercel, you can't use file paths. Convert the JSON to a single-line string:

**Option A: Using Terminal (macOS/Linux)**

```bash
# Read the JSON file and convert to single line
cat path/to/your-key.json | jq -c
```

**Option B: Manual**

1. Open the JSON file in a text editor
2. Remove all line breaks and extra spaces
3. Make it a single line
4. Copy the entire line

**Option C: Using Online Tool**

1. Go to [https://www.freeformatter.com/json-formatter.html](https://www.freeformatter.com/json-formatter.html)
2. Paste your JSON
3. Click "Minify"
4. Copy the result

### 5.5 Add to Vercel

1. In Vercel → **Settings** → **Environment Variables**
2. Add:
   - **Name**: `GOOGLE_CLOUD_CREDENTIALS_JSON`
   - **Value**: The single-line JSON string from above
   - **Environments**: Production, Preview

**Important**: 
- Don't add line breaks in the value
- The entire JSON should be on one line
- Keep this secret - never commit it to git

---

## Step 6: Update App URL

After your first deployment:

1. Go to Vercel → Your Project → **Settings** → **Environment Variables**
2. Update `NEXT_PUBLIC_APP_URL` to your actual Vercel URL:
   ```
   https://your-project-name.vercel.app
   ```
3. Redeploy (Vercel will auto-redeploy when you update env vars, or trigger manually)

---

## Step 7: Verify Deployment

### 7.1 Check Build Logs

1. Go to Vercel → Your Project → **Deployments**
2. Click on the latest deployment
3. Check **Build Logs** for any errors

### 7.2 Test Your App

1. Visit your Vercel URL
2. Try signing up/login
3. Test creating an account
4. Test AI prompt parsing
5. Check Supabase Dashboard → **Table Editor** to see data

### 7.3 Common Issues

**Issue: "Invalid environment variables"**
- Check all required env vars are set in Vercel
- Make sure `NEXT_PUBLIC_APP_URL` matches your Vercel domain
- Redeploy after adding env vars

**Issue: "Cannot connect to Supabase"**
- Verify `NEXT_PUBLIC_SUPABASE_URL` and keys are correct
- Check Supabase project is active (not paused)

**Issue: "OpenAI API error"**
- Verify `OPENAI_API_KEY` is correct
- Check OpenAI account has credits/payment method
- Check rate limits in OpenAI dashboard

**Issue: "Database error"**
- Make sure migrations ran successfully
- Check Supabase Dashboard → **Table Editor** to see if tables exist

---

## Step 8: Custom Domain (Optional - Free)

Vercel allows custom domains on the free tier:

1. Go to Vercel → Your Project → **Settings** → **Domains**
2. Add your domain (e.g., `accounting.yourdomain.com`)
3. Follow DNS configuration instructions
4. Vercel will provide SSL automatically (free)

---

## Step 9: Monitoring & Maintenance

### 9.1 Check Usage

- **Vercel**: Dashboard shows bandwidth usage
- **Supabase**: Dashboard → **Settings** → **Usage** shows database/storage usage
- **OpenAI**: Dashboard → **Usage** shows API usage and costs

### 9.2 Set Up Alerts

- **Vercel**: Automatic email alerts for deployments
- **Supabase**: Email alerts for usage limits (in Settings)
- **OpenAI**: Usage alerts (in Settings → Limits)

### 9.3 Database Backups

Supabase free tier includes:
- **Point-in-time recovery**: Last 7 days
- **Manual backups**: Export via Dashboard → **Settings** → **Database**

---

## 🎉 You're Live!

Your AI Accounting Platform is now deployed and accessible worldwide!

**Next Steps:**
1. Share your Vercel URL with team members
2. Create additional users via the invite system
3. Set up your chart of accounts
4. Start processing transactions!

---

## 📊 Free Tier Limits Summary

| Resource | Free Tier Limit | What Happens When Exceeded |
|----------|----------------|---------------------------|
| **Vercel Bandwidth** | 100GB/month | Site may slow down or require upgrade |
| **Supabase Database** | 500MB | Database becomes read-only |
| **Supabase Storage** | 1GB | Uploads will fail |
| **OpenAI API** | $5 free credits | Requires payment method |
| **Google Vision** | 1,000 requests/month | Charges apply ($1.50/1,000) |

**Tip**: Monitor usage regularly to avoid surprises!

---

## 🔒 Security Checklist

- ✅ Never commit `.env.local` or API keys to git
- ✅ Use Vercel environment variables (not hardcoded)
- ✅ Keep `SUPABASE_SERVICE_ROLE_KEY` secret (server-side only)
- ✅ Enable Supabase Row-Level Security (RLS) policies
- ✅ Use strong database passwords
- ✅ Enable 2FA on Vercel, Supabase, and OpenAI accounts

---

## 💰 Cost Estimation

**Free Tier Usage (Typical Small Business):**
- Vercel: $0 (within 100GB bandwidth)
- Supabase: $0 (within 500MB database)
- OpenAI: ~$10-20/month (after free credits)
- Google Vision: $0-5/month (if using OCR)

**Total**: ~$10-25/month for a small business

---

## 🆘 Need Help?

- **Vercel Issues**: [Vercel Docs](https://vercel.com/docs)
- **Supabase Issues**: [Supabase Docs](https://supabase.com/docs)
- **OpenAI Issues**: [OpenAI Docs](https://platform.openai.com/docs)
- **Project Issues**: Check `SETUP_GUIDE.md` for troubleshooting

---

**Happy Deploying! 🚀**

