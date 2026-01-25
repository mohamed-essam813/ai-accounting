# Setup Guide

Setup instructions for the AI Accounting Platform.

## Prerequisites

- Node.js v20.17.0+ or v22.9.0+
- npm
- Supabase account (free tier)
- OpenAI API key
- (Optional) Google Cloud account for OCR

---

## Step 1: Supabase Setup

### 1.1 Create Project

1. Go to [supabase.com](https://supabase.com) and sign up
2. **New Project** → name, password, region → wait 2–3 minutes

### 1.2 Get Credentials

1. **Settings** → **API**: Project URL, anon key, service_role key
2. **Settings** → **API** → **JWT Settings**: JWT Secret

Set in `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`.

### 1.3 Run Migrations

**Option A: Supabase CLI**

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

**Option B: SQL Editor**

1. Supabase Dashboard → **SQL Editor**
2. Run each file in `supabase/migrations/` in order
3. Run `supabase/seed.sql` for default accounts

### 1.4 Storage Bucket

**Storage** → **New bucket** → name: `receipts` (public or RLS as needed)

### 1.5 Generate Types (optional)

```bash
supabase gen types typescript --project-ref YOUR_PROJECT_REF --schema public > src/lib/database.types.ts
```

---

## Step 2: OpenAI Setup

1. [platform.openai.com](https://platform.openai.com) → **API Keys** → **Create new secret key**
2. Add to `.env.local` as `OPENAI_API_KEY`

Paid account required (~$0.005 per prompt with GPT-4o).

---

## Step 3: Google Cloud Vision (Optional – OCR)

1. [console.cloud.google.com](https://console.cloud.google.com) → create project → enable **Cloud Vision API**
2. Create service account with **Cloud Vision API User** → download JSON
3. Set `GOOGLE_APPLICATION_CREDENTIALS` to the JSON file path (local) or use `GOOGLE_CLOUD_CREDENTIALS_JSON` for Vercel (see [DEPLOYMENT.md](./DEPLOYMENT.md))

---

## Step 4: Local Setup

```bash
cp env.example .env.local
# Edit .env.local with Supabase, OpenAI, and optional OCR/FX keys

npm install
npm run dev
```

Visit `http://localhost:3000`.

---

## Step 5: Link First User

After signing up in the app:

1. Supabase Dashboard → **Authentication** → **Users** → copy your user ID
2. **SQL Editor** → run:

```sql
-- Create tenant
INSERT INTO tenants (id, name, subscription_tier)
VALUES (gen_random_uuid(), 'My Company', 'free')
RETURNING id;

-- Link user (replace YOUR_AUTH_USER_ID, TENANT_ID_FROM_ABOVE, your-email@example.com)
INSERT INTO app_users (id, auth_user_id, tenant_id, email, role)
VALUES (
  gen_random_uuid(),
  'YOUR_AUTH_USER_ID',
  'TENANT_ID_FROM_ABOVE',
  'your-email@example.com',
  'admin'
);
```

---

## Step 6: FX Rates (Optional)

Currency conversion works with **no keys** (ExchangeRate-API free tier). For higher limits or production:

- **ExchangeRate-API**: [exchangerate-api.com](https://www.exchangerate-api.com/) → `EXCHANGERATE_API_KEY`
- **Fixer.io**: [fixer.io](https://fixer.io/) → `FIXER_API_KEY` (recommended for production)
- **CurrencyAPI**: [currencyapi.com](https://currencyapi.com/) → `CURRENCYAPI_KEY`

Add to `.env.local`. Provider priority: Fixer → CurrencyAPI → ExchangeRate-API.

Optional: call `POST /api/fx-rates/update` (or use a cron) to refresh rates. See `env.example` for variable names.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't login | Ensure `app_users` record exists; link auth user to tenant |
| "User tenant not resolved" | Run Step 5 SQL to link user to tenant |
| OpenAI errors | Check API key and account credits |
| OCR fails | Verify `GOOGLE_APPLICATION_CREDENTIALS` path or `GOOGLE_CLOUD_CREDENTIALS_JSON` |
| Storage errors | Create `receipts` bucket in Supabase |

---

## RAG (Optional)

RAG improves AI parsing by using accounting context. Populate embeddings:

```ts
import { populateAllAccountEmbeddings } from "@/lib/ai/populate-embeddings";
await populateAllAccountEmbeddings(tenantId);
```

Migrations: `202411080008_rag_embeddings.sql`, `202411080009_rag_rpc_function.sql`.

---

## Security

- Never commit `.env.local`
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only
- Use RLS and strong DB passwords

For production deployment, see [DEPLOYMENT.md](./DEPLOYMENT.md).
