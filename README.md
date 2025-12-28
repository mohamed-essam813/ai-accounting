# AI Accounting Platform

A SaaS accounting platform that converts natural language prompts into structured accounting entries using AI, with human review, approval workflows, and comprehensive financial reporting.

## 🚀 Quick Start

1. **Read the [Setup Guide](./SETUP_GUIDE.md)** for detailed installation instructions
2. **Copy environment template**: `cp env.example .env.local`
3. **Fill in your keys** (Supabase, OpenAI, optional Google Cloud)
4. **Run migrations** (see Setup Guide)
5. **Start dev server**: `npm run dev`

## 📚 Documentation

- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - Setup instructions and configuration
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment guide for Vercel, Supabase, and OpenAI
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - Implementation summary

## 🛠 Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes + Server Actions
- **Database**: Supabase (PostgreSQL + Row-Level Security)
- **AI**: OpenAI GPT-4o (or GPT-5.1 if available) via Vercel AI SDK with RAG (Retrieval-Augmented Generation)
- **Storage**: Supabase Storage
- **OCR**: Google Cloud Vision API (optional)

## ✨ Features

- Natural language prompt → AI draft generation
- Draft review, editing, and approval workflow
- Double-entry journal posting with balance validation
- Insight Engine - Automatic contextual insights after every transaction
- Financial Radar Dashboard with attention signals
- Inventory management (FIFO/Weighted Average)
- Fixed assets & depreciation
- Financial reports (P&L, Balance Sheet, Cash Flow, AR/AP Ageing)
- Bank reconciliation with CSV import
- Contacts management (customers and vendors)
- Multi-tenant architecture with RLS
- User roles and permissions (admin, accountant, business_user, auditor)

## 📁 Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── (app)/        # Protected app routes
│   ├── api/          # API endpoints
│   └── auth/         # Authentication pages
├── components/       # React components
│   ├── ui/           # shadcn/ui components
│   └── ...           # Feature components
└── lib/              # Core libraries
    ├── actions/      # Server actions
    ├── data/         # Data access layer
    ├── ai/           # AI integration
    └── supabase/     # Supabase clients
```

## 🔧 Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Lint code
npm run lint

# Build for production
npm run build
```

## 🔐 Environment Variables

See `env.example` for required variables. **Never commit `.env.local` to version control.**

Required:
- `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` & `SUPABASE_JWT_SECRET`
- `OPENAI_API_KEY`

Optional:
- `GOOGLE_APPLICATION_CREDENTIALS` (for OCR features)

## 🗄 Database

Migrations are in `supabase/migrations/`. Run them via:
- Supabase CLI: `supabase db push`
- Or Supabase Dashboard SQL Editor

See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for details.

## 🧪 Testing

Currently manual testing only. Automated tests planned for future release.


## 💰 Costs

**Free Tier (Development/Small Business):**
- Vercel: Free (100GB bandwidth/month)
- Supabase: Free tier (500MB database, 1GB storage)
- OpenAI: $5 free credits, then ~$10-20/month
- **Total**: ~$10-25/month after free credits

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment guide.

## 📝 License

Private project - All rights reserved

---

**Need help?** Check [SETUP_GUIDE.md](./SETUP_GUIDE.md) for setup instructions and troubleshooting.
