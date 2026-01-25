# AI Accounting Platform

SaaS accounting platform: natural-language prompts → AI drafts → human review → approval workflows → financial reporting.

## Quick Start

1. **[Setup Guide](./SETUP_GUIDE.md)** – installation, env vars, migrations, link first user
2. `cp env.example .env.local` and add Supabase, OpenAI keys
3. Run migrations (Supabase CLI or SQL Editor)
4. `npm run dev`

## Documentation

- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** – local setup, Supabase, OpenAI, OCR, FX rates, RAG
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** – deploy to Vercel, Supabase, OpenAI, optional GCP Vision

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind, shadcn/ui
- **Backend**: API Routes + Server Actions
- **Database**: Supabase (PostgreSQL, RLS)
- **AI**: OpenAI (Vercel AI SDK, RAG)
- **Storage**: Supabase Storage  
- **OCR**: Google Cloud Vision (optional)

## Features

- Natural language → AI draft → review & approve
- Double-entry posting, balance validation
- Insights, dashboard, attention signals
- Inventory (FIFO / WA), fixed assets & depreciation
- Reports: P&L, Balance Sheet, Cash Flow, AR/AP Ageing, Trial Balance, VAT
- Bank reconciliation (PDF import), contacts, multi-tenant, roles

## Project Structure

```
src/
├── app/          # App Router (pages, API)
├── components/   # UI (shadcn + feature components)
└── lib/          # actions, data, AI, Supabase
```

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Environment

See `env.example`. Required: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `OPENAI_API_KEY`. Optional: Google Vision, FX API keys. Never commit `.env.local`.

## Database

Migrations in `supabase/migrations/`. Run via Supabase CLI (`supabase db push`) or SQL Editor. See [SETUP_GUIDE.md](./SETUP_GUIDE.md).

## Costs (typical)

- Vercel: free tier
- Supabase: free tier
- OpenAI: ~$10–20/month after credits  
See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup.
