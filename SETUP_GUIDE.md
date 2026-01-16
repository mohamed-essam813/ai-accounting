# Setup Guide

Complete setup instructions for the AI Accounting Platform.

## Prerequisites

- Node.js v20.17.0+ or v22.9.0+
- npm
- Supabase account (free tier works)
- OpenAI API key
- (Optional) Google Cloud account for OCR

---

## Step 1: Supabase Setup

### 1.1 Create Project

1. Go to [supabase.com](https://supabase.com) and sign up
2. Click **"New Project"**
3. Fill in name, password, region
4. Wait 2-3 minutes for initialization

### 1.2 Get Credentials

1. Go to **Settings** → **API**
2. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`
3. Go to **Settings** → **API** → **JWT Settings**
   - Copy **JWT Secret** → `SUPABASE_JWT_SECRET`

### 1.3 Run Migrations

**Option A: Supabase CLI**

```bash
# Install CLI (direct download recommended)
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_darwin_arm64.tar.gz | tar -xz
sudo mv supabase /usr/local/bin/

# Login and link
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

**Option B: Dashboard SQL Editor**

1. Go to **SQL Editor** in Supabase dashboard
2. Run each migration file from `supabase/migrations/` in order (all 22 files)
3. Run `supabase/seed.sql` after migrations to create default accounts

### 1.4 Create Storage Bucket

1. Go to **Storage** → **New bucket**
2. Name: `receipts`
3. Public: Yes (or No with RLS policies)

### 1.5 Generate TypeScript Types

```bash
supabase gen types typescript --project-ref YOUR_PROJECT_REF --schema public > src/lib/database.types.ts
```

---

## Step 2: OpenAI Setup

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up/login
3. Go to **API Keys** → **Create new secret key**
4. Copy the key → `OPENAI_API_KEY`

**Note**: Paid account required. GPT-4o costs ~$0.005 per prompt.

---

## Step 3: Google Cloud Vision (Optional - OCR)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create project and enable **Cloud Vision API**
3. Create service account with **Cloud Vision API User** role
4. Download JSON credentials
5. Save path → `GOOGLE_APPLICATION_CREDENTIALS`

---

## Step 4: Local Setup

### 4.1 Install Dependencies

```bash
npm install
```

### 4.2 Environment Variables

```bash
cp env.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret
OPENAI_API_KEY=your_openai_key
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

### 4.3 Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

---

## Step 5: Link First User

After signing up, link your Supabase Auth user to a tenant:

1. Get your Auth User ID from Supabase Dashboard → **Authentication** → **Users**
2. Run in SQL Editor:

   ```sql
-- Create tenant
INSERT INTO tenants (id, name, subscription_tier)
VALUES (gen_random_uuid(), 'My Company', 'free')
   RETURNING id;

-- Link user (replace USER_ID and TENANT_ID)
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

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't login | Check if `app_users` record exists |
| "User tenant not resolved" | Link auth user to `app_users` table |
| OpenAI errors | Verify API key and account credits |
| OCR fails | Check `GOOGLE_APPLICATION_CREDENTIALS` path |
| Storage errors | Create `receipts` bucket in Supabase |

---

## RAG Feature

RAG (Retrieval-Augmented Generation) enhances AI accuracy by providing context from your accounting system.

**How it works:**
- Automatically generates embeddings for accounts, transactions, and mappings
- Searches for similar context when parsing prompts
- Improves account recognition and parsing accuracy

**Populate existing data:**

```typescript
import { populateAllAccountEmbeddings } from "@/lib/ai/populate-embeddings";
await populateAllAccountEmbeddings(tenantId);
```

See migration files `202411080008_rag_embeddings.sql` and `202411080009_rag_rpc_function.sql` for details.

---

## Security

- Never commit `.env.local`
- Keep `SUPABASE_SERVICE_ROLE_KEY` secret (server-side only)
- Enable RLS policies
- Use strong database passwords

---

**Need help?** See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment.
