# Deployment Guide

Deploy to Vercel with Supabase and OpenAI.

## Quick Start

1. `npm run build` (verify locally)
2. Push to GitHub
3. Deploy on Vercel → add env vars → deploy
4. Run Supabase migrations (CLI or SQL Editor)
5. Link first user (see Step 3.4 below)

## Prerequisites

- GitHub, Vercel, Supabase, OpenAI accounts (free tiers ok)

---

## Step 1: Prepare Code

### 1.1 Push to GitHub

```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/ai-accounting.git
git branch -M main && git push -u origin main
```

### 1.2 Verify Build

```bash
npm run build
```

---

## Step 2: Deploy to Vercel

### 2.1 Import Project

1. [vercel.com](https://vercel.com) → **Add New** → **Project**
2. Import GitHub repo
3. **Do not deploy yet** – set env vars first

### 2.2 Environment Variables

**Settings** → **Environment Variables**. Add:

| Variable | Value | Environments |
|----------|--------|---------------|
| `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app` (after first deploy) | All |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | All |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key | Prod, Preview |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret | Prod, Preview |
| `OPENAI_API_KEY` | OpenAI API key | Prod, Preview |

**Optional – OCR:** `GOOGLE_CLOUD_CREDENTIALS_JSON` = minified service-account JSON as a single-line string (see Step 5). Prod, Preview only.

**Optional – FX:** `EXCHANGERATE_API_KEY`, `FIXER_API_KEY`, or `CURRENCYAPI_KEY`. See [SETUP_GUIDE.md](./SETUP_GUIDE.md#step-6-fx-rates-optional).

### 2.3 Deploy

Click **Deploy**. App at `https://your-project.vercel.app`.

---

## Step 3: Supabase

### 3.1 Create Project

1. [supabase.com](https://supabase.com) → **New Project**
2. Name, password, region, Free plan

### 3.2 API Keys

**Settings** → **API**: URL, anon key, service_role key.  
**Settings** → **API** → **JWT Settings**: JWT secret. Use these for Vercel env vars.

### 3.3 Migrations

**Option A – CLI:** `supabase link --project-ref YOUR_REF` then `supabase db push`  
**Option B – SQL Editor:** Run each file in `supabase/migrations/` in order, then `supabase/seed.sql`

### 3.4 Link First User

1. Sign up in the deployed app (creates Auth user)
2. Supabase → **Authentication** → **Users** → copy user ID
3. **SQL Editor**:

```sql
INSERT INTO tenants (id, name, subscription_tier)
VALUES (gen_random_uuid(), 'My Company', 'free')
RETURNING id;

INSERT INTO app_users (id, auth_user_id, tenant_id, email, role)
VALUES (
  gen_random_uuid(),
  'YOUR_AUTH_USER_ID',
  'TENANT_ID_FROM_ABOVE',
  'your@email.com',
  'admin'
);
```

---

## Step 4: OpenAI

1. [platform.openai.com](https://platform.openai.com) → **API Keys** → **Create new secret key**
2. Add to Vercel as `OPENAI_API_KEY`  
Set usage limits in **Settings** → **Limits** (recommended).

---

## Step 5: Google Cloud Vision (Optional – OCR)

1. [console.cloud.google.com](https://console.cloud.google.com) → project → enable **Cloud Vision API**
2. **IAM** → **Service Accounts** → create → **Cloud Vision API User** → create JSON key
3. Minify JSON to one line: `cat key.json | jq -c` (or minify online)
4. Vercel → **Environment Variables** → `GOOGLE_CLOUD_CREDENTIALS_JSON` = that string (Prod, Preview)

---

## Step 6: Post-Deploy

1. Set `NEXT_PUBLIC_APP_URL` in Vercel to your actual app URL
2. Visit app → login → verify

## Common Issues

- **Auth / tenant errors**: Ensure user linked via Step 3.4
- **Supabase errors**: Check URL, keys, migrations
- **OpenAI errors**: Check key and credits
