# Complete Setup Guide - AI Accounting Platform

This guide walks you through setting up all required services and configurations to run the AI Accounting Platform.

---

## Prerequisites

- **Node.js**: v20.17.0+ or v22.9.0+ (v21.x works but may show warnings)
  - Check version: `node --version`
  - If you need to switch: `nvm install 20.17.0 && nvm use 20.17.0`
- **npm**: Latest version
- A Supabase account (free tier works)
- An OpenAI API key (paid account required for GPT-4o)
- (Optional) Google Cloud account for OCR features
- (Optional) Homebrew for macOS (for easier Supabase CLI installation)

---

## Step 1: Supabase Setup

### 1.1 Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign up/login
2. Click **"New Project"**
3. Fill in:
   - **Name**: `ai-accounting` (or your choice)
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier is fine for development
4. Click **"Create new project"** (takes 2-3 minutes)

### 1.2 Get Supabase Credentials

1. In your project dashboard, go to **Settings** → **API**
2. Copy these values (you'll need them later):
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep this secret!)

3. Go to **Settings** → **API** → **JWT Settings**
   - Copy the **JWT Secret** → `SUPABASE_JWT_SECRET`

### 1.3 Run Database Migrations

**Option A: Using Supabase CLI**

⚠️ **Important**: Don't install Supabase CLI via `npm install -g`. Use one of these methods:

**Method 1: Direct Download (Easiest - No Homebrew/CLT needed)** ⭐ RECOMMENDED

```bash
# For Intel Macs
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_darwin_amd64.tar.gz | tar -xz

# For Apple Silicon (M1/M2/M3)
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_darwin_arm64.tar.gz | tar -xz

# Move to PATH
sudo mv supabase /usr/local/bin/

# Verify
supabase --version

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
supabase db push
```

**Method 2: Homebrew (If you have it working)**

⚠️ **If you get "Command Line Tools does not support macOS 15" error**, see `QUICK_FIX.md` first.

```bash
# Install via Homebrew
brew install supabase/tap/supabase

# Verify installation
supabase --version

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
supabase db push
```

**Note**: If you encounter Command Line Tools issues, just use Method 1 (Direct Download) or Option B (Dashboard) instead.

**Option B: Using Supabase Dashboard SQL Editor**

1. Go to **SQL Editor** in your Supabase dashboard
2. Run each migration file in order:
   - `supabase/migrations/202411080001_init.sql`
   - `supabase/migrations/202411080002_pending_invites.sql`
   - `supabase/migrations/202411080003_intent_mappings.sql`
   - `supabase/migrations/202411080004_source_documents.sql`
   - `supabase/migrations/202411080005_ai_usage.sql`
   - `supabase/migrations/202411080006_subscriptions.sql`
   - `supabase/migrations/202411080007_fix_app_users_rls.sql`
   - `supabase/migrations/202411080008_rag_embeddings.sql` (RAG feature)
   - `supabase/migrations/202411080009_rag_rpc_function.sql` (RAG feature)

3. After migrations, run the seed file:
   - `supabase/seed.sql`

**Note**: The migrations include RAG (Retrieval-Augmented Generation) support. See the RAG section below for details.

### 1.4 Create Storage Bucket

1. Go to **Storage** in Supabase dashboard
2. Click **"New bucket"**
3. Name: `receipts`
4. **Public bucket**: ✅ Yes (or No if you want private)
5. Click **"Create bucket"**

### 1.5 Set Up Storage Policies (if bucket is private)

If you made the bucket private, add RLS policies:

1. Go to **Storage** → **Policies** → `receipts` bucket
2. Add policy for **SELECT**:
   ```sql
   CREATE POLICY "Users can view their tenant documents"
   ON storage.objects FOR SELECT
   USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.jwt() ->> 'tenant_id');
   ```

3. Add policy for **INSERT**:
   ```sql
   CREATE POLICY "Users can upload to their tenant folder"
   ON storage.objects FOR INSERT
   WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.jwt() ->> 'tenant_id');
   ```

### 1.6 Using Supabase CLI (Quick Reference)

If you already have Supabase CLI installed, here's a quick reference:

```bash
# Login to Supabase
supabase login

# Link your project (get project ref from Dashboard → Settings → General)
supabase link --project-ref YOUR_PROJECT_REF

# Run all migrations
supabase db push

# Generate TypeScript types
supabase gen types typescript --project-id YOUR_PROJECT_REF --schema public > src/lib/database.types.ts

# Check migration status
supabase migration list

# View database status
supabase status
```

**Common Issues:**
- **"Not linked to a project"**: Run `supabase link --project-ref YOUR_PROJECT_REF`
- **"Migration failed"**: Check error message, can run individual migrations via Dashboard SQL Editor
- **"Permission denied"**: Make sure you're logged in with `supabase login`

### 1.7 Generate TypeScript Types

**Prerequisites**: Make sure Supabase CLI is installed (see Step 1.3)

```bash
# Get your project reference ID from Supabase dashboard URL
# Format: https://app.supabase.com/project/YOUR_PROJECT_REF

supabase gen types typescript --project-ref YOUR_PROJECT_REF --schema public > src/lib/database.types.ts
```

**Note**: If you don't have Supabase CLI installed, you can also generate types via:
1. Supabase Dashboard → Settings → API → Generate TypeScript types
2. Copy the output and save to `src/lib/database.types.ts`

---

## Step 2: OpenAI Setup

### 2.1 Get API Key

1. Go to [https://platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Go to **API Keys** section
4. Click **"Create new secret key"**
5. Name it (e.g., "AI Accounting Dev")
6. Copy the key immediately (you won't see it again!)
7. Save it → `OPENAI_API_KEY`

**Note**: You need a paid OpenAI account with credits. GPT-4o costs ~$0.005 per prompt.

### 2.2 (Optional) Set Usage Limits

1. Go to **Settings** → **Limits**
2. Set a monthly spending limit (e.g., $20)
3. Enable usage alerts

---

## Step 3: Google Cloud Vision Setup (Optional - for OCR)

### 3.1 Create GCP Project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable **Cloud Vision API**:
   - Go to **APIs & Services** → **Library**
   - Search "Cloud Vision API"
   - Click **Enable**

### 3.2 Create Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **"Create Service Account"**
3. Name: `ai-accounting-vision`
4. Description: `Service account for AI Accounting OCR features`
5. Click **"Create and Continue"**

### 3.3 Grant Permissions

**Option A: Grant Cloud Vision API Access (Recommended)**

1. In the **"Grant this service account access to project"** step:
2. Click **"Select a role"** dropdown
3. Search for one of these roles (they're equivalent):
   - **"Cloud Vision API User"** (if available)
   - **"Cloud Vision API Service Agent"** (if available)
   - **"Service Account User"** (more general, also works)
   - Or just type "Vision" and look for Vision-related roles
4. Select the role
5. Click **"Continue"** → **"Done"**

**Option B: Skip Role Assignment (API Key Method)**

If you can't find the role, you can skip role assignment for now. The service account will work as long as the Cloud Vision API is enabled for your project.

**Note**: The role name might vary by GCP region/version. As long as the Cloud Vision API is enabled (Step 3.1), the service account will work.

### 3.4 Download Credentials

1. Go back to **IAM & Admin** → **Service Accounts**
2. Click on the service account you just created (`ai-accounting-vision`)
3. Go to **Keys** tab
4. Click **"Add Key"** → **"Create new key"**
5. Choose **JSON** format
6. Click **"Create"** - the file will download automatically
7. Save the downloaded file (e.g., `ai-accounting-vision-key.json`) in your project root or a secure location
8. Note the full path → `GOOGLE_APPLICATION_CREDENTIALS`

**Example**: `/Users/essam/Desktop/personal/ai-accounting/ai-accounting-vision-key.json`

**Important**: 
- Keep this file secure and never commit it to git
- Add it to `.gitignore`: `*.json` (if storing in project) or the specific filename

### 3.5 Alternative: Use API Key Instead (Simpler)

If service accounts are confusing, you can use an API Key instead:

1. Go to **APIs & Services** → **Credentials**
2. Click **"Create Credentials"** → **"API Key"**
3. Copy the API key
4. (Optional) Restrict the key to Cloud Vision API only
5. Add to `.env.local` as `GOOGLE_VISION_API_KEY=your_key_here`

**Note**: The current code uses service account method. To use API key, you'd need to modify `src/lib/ocr/vision.ts`. Service account method is more secure for production.

---

## Step 4: Local Project Setup

### 4.1 Install Dependencies

```bash
cd /Users/essam/Desktop/personal/ai-accounting
npm install
```

### 4.2 Create Environment File

```bash
cp env.example .env.local
```

### 4.3 Fill Environment Variables

Edit `.env.local` with your values:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_JWT_SECRET=your_jwt_secret_here
OPENAI_API_KEY=sk-your_openai_key_here
GOOGLE_APPLICATION_CREDENTIALS=/full/path/to/ai-accounting-vision-key.json
```

**Important**: 
- Use absolute paths for `GOOGLE_APPLICATION_CREDENTIALS`
- Never commit `.env.local` to git
- The service role key should NEVER be exposed to the client

### 4.4 Verify Database Types

If you used Supabase CLI to generate types, they should already be updated. Otherwise:

```bash
supabase gen types typescript --project-ref YOUR_PROJECT_REF --schema public > src/lib/database.types.ts
```

---

## Step 5: Create First User & Tenant

### 5.1 Set Up Supabase Auth

1. Go to **Authentication** → **Providers** in Supabase
2. Enable **Email** provider (should be enabled by default)
3. (Optional) Configure email templates

### 5.2 Create User via Supabase Dashboard

**Option A: Using Supabase Dashboard**

1. Go to **Authentication** → **Users**
2. Click **"Add user"** → **"Create new user"**
3. Enter:
   - **Email**: `admin@demo.com` (or your email)
   - **Password**: Create a strong password
   - **Auto Confirm User**: ✅ Yes
4. Click **"Create user"**
5. **Copy the User ID** (UUID format)

### 5.3 Link User to Tenant

The seed file should have created a demo tenant. You need to link your auth user to it:

1. Go to **SQL Editor** in Supabase
2. Run this query (replace `YOUR_USER_ID` with the UUID from step 5.2):

```sql
-- Update the app_users record to link to your auth user
UPDATE app_users 
SET auth_user_id = 'YOUR_USER_ID'
WHERE email = 'admin@demo.com';
```

**Or create a new user record**:

```sql
-- Insert new user linked to your auth account
INSERT INTO app_users (id, auth_user_id, tenant_id, email, role)
VALUES (
  gen_random_uuid(),
  'YOUR_USER_ID',  -- From Supabase Auth
  '11111111-1111-1111-1111-111111111111',  -- Demo tenant ID from seed
  'your-email@example.com',
  'admin'
);
```

---

## Step 6: Run the Application

### 6.1 Start Development Server

```bash
npm run dev
```

### 6.2 Access the App

1. Open [http://localhost:3000](http://localhost:3000)
2. You'll be redirected to `/auth` page (login/signup)
3. **First time setup**: You need to create a user and link it to a tenant

### 6.3 First Time User Setup

**Method 1: Sign Up via App (Recommended)**

1. Go to [http://localhost:3000/auth](http://localhost:3000/auth)
2. Click "Don't have an account? Sign up"
3. Enter your email and password
4. After signup, you'll need to link your account to a tenant (see below)

**Method 2: Create via Supabase Dashboard**

1. Create user in Supabase Dashboard (Step 5.2)
2. Link to `app_users` table (Step 5.3)
3. Then login via `/auth` page

### 6.4 Link New User to Tenant

After signing up, you need to link your Supabase Auth user to an `app_users` record:

1. **Get your Auth User ID**:
   - Go to Supabase Dashboard → Authentication → Users
   - Find your email and copy the User ID (UUID)

2. **Link to existing tenant** (use demo tenant from seed):
   ```sql
   INSERT INTO app_users (id, auth_user_id, tenant_id, email, role)
   VALUES (
     gen_random_uuid(),
     'YOUR_AUTH_USER_ID',  -- From Supabase Auth
     '11111111-1111-1111-1111-111111111111',  -- Demo tenant ID
     'your-email@example.com',
     'admin'
   );
   ```

3. **Or create new tenant**:
   ```sql
   -- Create new tenant
   INSERT INTO tenants (id, name)
   VALUES (gen_random_uuid(), 'My Company')
   RETURNING id;

   -- Then link user (use the tenant ID from above)
   INSERT INTO app_users (id, auth_user_id, tenant_id, email, role)
   VALUES (
     gen_random_uuid(),
     'YOUR_AUTH_USER_ID',
     'TENANT_ID_FROM_ABOVE',
     'your-email@example.com',
     'admin'
   );
   ```

4. **Refresh the app** and you should be logged in!

---

## Step 7: Verify Everything Works

### 7.1 Test Checklist

- [ ] **Login**: Can you log in with your credentials?
- [ ] **Dashboard**: Do you see the dashboard with metrics?
- [ ] **Prompt**: Try creating a prompt like "Record an invoice for AED 5000 to Al Faisal for consulting"
- [ ] **Drafts**: Check if draft appears in `/drafts` page
- [ ] **Accounts**: Verify chart of accounts shows seeded accounts
- [ ] **Bank Upload**: Try uploading a CSV file
- [ ] **Reports**: Check if P&L and Balance Sheet pages load

### 7.2 Common Issues

**Issue: "User tenant not resolved"**
- Solution: Make sure `app_users` record exists and `auth_user_id` matches your Supabase Auth user ID

**Issue: "Missing chart of account with code 1000"**
- Solution: Run `supabase/seed.sql` to create default accounts

**Issue: OCR upload fails**
- Solution: Check `GOOGLE_APPLICATION_CREDENTIALS` path is correct and file exists
- Verify Cloud Vision API is enabled in GCP project
- Check service account has proper permissions

**Issue: "Cannot find Cloud Vision API User role"**
- Solution: The role name may vary. Try these alternatives:
  - Search for "Vision" in the role dropdown
  - Use "Service Account User" (more general, still works)
  - Or skip role assignment - as long as Cloud Vision API is enabled, it will work
- Alternative: You can also use API Key method instead of service account (see below)

**Issue: OpenAI API errors**
- Solution: Verify API key is correct and account has credits

**Issue: "npm WARN EBADENGINE Unsupported engine" (Node.js version warnings)**
- These are just warnings, not errors. The app will still work.
- To fix: Upgrade to Node.js v20.17.0+ or v22.9.0+
  ```bash
  # Using nvm
  nvm install 20.17.0
  nvm use 20.17.0
  ```

**Issue: "Installing Supabase CLI as a global module is not supported"**
- Solution: Don't use `npm install -g supabase`
- Use direct download instead (see Step 1.3, Method 1)
- Or use Supabase Dashboard SQL Editor (no CLI needed)

**Issue: "Command Line Tools (CLT) does not support macOS 15"**
- Solution: Update Command Line Tools:
  ```bash
  sudo rm -rf /Library/Developer/CommandLineTools
  sudo xcode-select --install
  ```
- Then follow the installation prompts
- Or go to **System Settings** → **Software Update** and check for updates
- Or manually download from: https://developer.apple.com/download/all/ (Command Line Tools for Xcode 16.4+)
- **Alternative**: Skip Homebrew entirely and use direct download method (see Step 1.3, Method 1)
- Or use Supabase Dashboard SQL Editor (no CLI/Homebrew needed)

**Issue: "Cannot find Cloud Vision API User role" (Google Cloud)**
- **Most Important**: Enable Cloud Vision API first (APIs & Services → Library → Enable)
- The role name may vary. Try these in order:
  1. Search for "Vision" in the role dropdown
  2. Use "Service Account User" (general role, works fine)
  3. Skip role assignment entirely - if API is enabled, it will work
- **Why**: The API being enabled is more important than the specific role name
- Service accounts inherit project-level API access when the API is enabled

---

## Step 8: Production Deployment (Future)

When ready to deploy:

1. **Vercel Deployment**:
   - Connect GitHub repo
   - Add all environment variables
   - Deploy

2. **Supabase Production**:
   - Use same Supabase project or create new one
   - Run migrations again
   - Update `NEXT_PUBLIC_SUPABASE_URL` in Vercel

3. **Update App URL**:
   - Set `NEXT_PUBLIC_APP_URL` to your production domain

---

## Quick Reference: Environment Variables

| Variable | Where to Get | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_APP_URL` | Your app URL | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API | ✅ Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API | ✅ Yes |
| `SUPABASE_JWT_SECRET` | Supabase Dashboard → Settings → API → JWT | ✅ Yes |
| `OPENAI_API_KEY` | OpenAI Platform → API Keys | ✅ Yes |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP Service Account JSON path | ⚠️ Optional |

---

## Next Steps After Setup

1. **Create more users**: Use the invite system in Settings
2. **Configure accounts**: Add your chart of accounts
3. **Set up intent mappings**: Configure which accounts to use for invoices/bills
4. **Test workflows**: Create drafts, approve, and post entries
5. **Upload bank statements**: Test reconciliation features

---

## Support

If you encounter issues:
1. Check Supabase logs: **Logs** → **Postgres Logs**
2. Check browser console for errors
3. Verify all environment variables are set correctly
4. Ensure migrations ran successfully

---

**That's it! Your AI Accounting Platform should now be running.** 🎉

---

## Summary: What's Implemented vs What's Missing

### ✅ Fully Implemented Features

1. **Core Accounting Workflow**
   - Natural language prompt → AI draft generation
   - Draft review, editing, and approval
   - Journal entry posting with double-entry validation
   - Configurable intent-to-account mappings
   - Tax handling in journal entries

2. **Bank Reconciliation**
   - CSV file upload and parsing
   - Transaction storage and management
   - AI-powered match suggestions
   - Manual reconciliation actions

3. **Financial Reporting**
   - Profit & Loss statements
   - Balance Sheet
   - Trial Balance
   - Dashboard with KPIs

4. **User & Tenant Management**
   - Multi-tenant architecture with RLS
   - User roles (admin, accountant, business_user, auditor)
   - User invitations system
   - Tenant profile management

5. **Subscription Management**
   - Subscription plans (Starter, Growth, Enterprise)
   - Usage tracking and limits
   - Plan switching (manual, no payment processing yet)

6. **AI Cost Controls**
   - Prompt caching to reduce API calls
   - Daily usage limits per tenant
   - Usage logging and tracking

7. **OCR Document Processing**
   - File upload to Supabase Storage
   - Google Cloud Vision integration
   - Document history and text extraction

8. **Authentication**
   - Login/Signup pages
   - Supabase Auth integration
   - Session management
   - Protected routes

### ⚠️ Missing/Incomplete Features

1. **Payment Processing**
   - No Stripe/Paddle integration
   - No webhook handlers for subscription updates
   - No invoice generation
   - Manual plan changes only

2. **Email Notifications**
   - No email templates configured
   - No invite email sending
   - No notification system

3. **Advanced Features (From PRD Future Enhancements)**
   - Voice input for prompts
   - Real-time banking API integrations
   - Automated VAT filings
   - Multi-currency consolidation
   - AI usage dashboard for admins

4. **Production Readiness**
   - No automated tests
   - No CI/CD pipeline
   - No error monitoring (Sentry, etc.)
   - No performance monitoring

### 🔧 To Make Production-Ready

1. **Integrate Payment Provider** (Stripe recommended)
   - Set up Stripe account
   - Add webhook endpoints
   - Connect subscription status updates
   - Add payment method management UI

2. **Configure Email Service**
   - Set up email provider (SendGrid, Resend, etc.)
   - Configure Supabase email templates
   - Add email sending for invites/notifications

3. **Add Monitoring**
   - Error tracking (Sentry)
   - Analytics (PostHog, Mixpanel)
   - Uptime monitoring

4. **Security Hardening**
   - Rate limiting
   - Input validation review
   - Security audit

5. **Testing**
   - Unit tests
   - Integration tests
   - E2E tests (Playwright/Cypress)

---

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't login | Check if `app_users` record exists and `auth_user_id` matches |
| "User tenant not resolved" | Link auth user to `app_users` table (Step 6.4) |
| OpenAI errors | Verify API key and account has credits |
| OCR fails | Check `GOOGLE_APPLICATION_CREDENTIALS` path |
| Storage errors | Create `receipts` bucket in Supabase Storage |
| Type errors | Regenerate types: `supabase gen types typescript --project-ref YOUR_REF --schema public > src/lib/database.types.ts` |

---

## RAG (Retrieval-Augmented Generation) Feature

RAG enhances AI accuracy by providing relevant context from your accounting system. When you enter a prompt, the system retrieves similar context from your accounts, transactions, and mappings.

### How It Works

1. **Automatic Embedding Generation**: When accounts, transactions, or mappings are created/updated, embeddings are automatically generated using OpenAI's `text-embedding-3-small` model.

2. **Vector Similarity Search**: When parsing a prompt, the system:
   - Generates an embedding for your prompt
   - Searches for similar embeddings using cosine similarity
   - Retrieves the top 5 most relevant contexts (similarity ≥ 0.7)
   - Includes them in the AI prompt

3. **Context Types**: The system retrieves context from:
   - **Accounts**: Account names, codes, and types
   - **Transactions**: Past journal entries with descriptions, amounts, dates
   - **Mappings**: Intent-to-account mappings for better account suggestions

### Benefits

- **Better Account Recognition**: AI understands your specific account names and codes
- **Context-Aware Parsing**: Learns from past transactions to understand patterns
- **Improved Accuracy**: Reduces errors by understanding company-specific terminology
- **Automatic Learning**: System gets smarter as you add more accounts and transactions

### Populating Existing Data

To populate embeddings for existing accounts and mappings:

```typescript
import { populateAllAccountEmbeddings, populateAllMappingEmbeddings } from "@/lib/ai/populate-embeddings";

// Populate all account embeddings for a tenant
await populateAllAccountEmbeddings(tenantId);

// Populate all mapping embeddings for a tenant
await populateAllMappingEmbeddings(tenantId);
```

You can call these from a server action or API route after running the migrations.

### Technical Details

- **Vector Model**: OpenAI `text-embedding-3-small` (1536 dimensions)
- **Similarity Metric**: Cosine similarity
- **Index Type**: HNSW for fast approximate nearest neighbor search
- **Similarity Threshold**: 0.7 (configurable)
- **Max Results**: 5 most relevant contexts
- **Cost**: ~$0.00002 per account/transaction (very cheap)

---

## Security Best Practices

### 🔒 Critical Guidelines

1. **Never commit `.env.local`** - It's in `.gitignore` for a reason
2. **Rotate compromised keys immediately** if accidentally exposed
3. **Service Role Key** - Only used server-side (never in client code)
4. **Store Google Cloud keys** outside project directory when possible
5. **Use environment variables** in production (Vercel, etc.)

### Production Checklist

- [ ] All API keys in environment variables (not code)
- [ ] `.env.local` never committed
- [ ] Service role key only used server-side
- [ ] RLS policies enabled and tested
- [ ] HTTPS enabled in production
- [ ] Dependencies up to date (`npm audit`)

See `README.md` for more security details.

---

**Need Help?** Check the main README.md or review the code comments in `src/lib/` for implementation details.

