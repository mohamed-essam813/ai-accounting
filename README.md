# AI Accounting Platform

A SaaS accounting platform that converts natural language prompts into structured accounting entries using AI, with human review, approval workflows, and comprehensive financial reporting.

## 🚀 Quick Start

1. **Read the [Setup Guide](./SETUP_GUIDE.md)** for detailed installation instructions
2. **Copy environment template**: `cp env.example .env.local`
3. **Fill in your keys** (Supabase, OpenAI, optional Google Cloud)
4. **Run migrations** (see Setup Guide)
5. **Start dev server**: `npm run dev`

## 📚 Documentation

- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - Complete setup instructions, troubleshooting, security guidelines, and RAG feature documentation
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Free tier deployment guide for Vercel, Supabase, and OpenAI

## 🛠 Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes + Server Actions
- **Database**: Supabase (PostgreSQL + Row-Level Security)
- **AI**: OpenAI GPT-5.1 via Vercel AI SDK with RAG (Retrieval-Augmented Generation)
- **Storage**: Supabase Storage
- **OCR**: Google Cloud Vision API (optional)

## ✨ Features

- ✅ Natural language prompt → AI draft generation
- ✅ Draft review, editing, and approval workflow
- ✅ Double-entry journal posting with balance validation
- ✅ Configurable intent-to-account mappings
- ✅ Bank CSV import and reconciliation
- ✅ Financial reports (P&L, Balance Sheet, Trial Balance)
- ✅ Multi-tenant architecture with RLS
- ✅ User roles and permissions
- ✅ Subscription management
- ✅ OCR document processing
- ✅ AI usage tracking and caching
- ✅ RAG (Retrieval-Augmented Generation) for context-aware AI parsing

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

## ⚠️ Missing for Production

- Payment processing (Stripe/Paddle integration)
- Email notifications system
- Automated tests (unit + E2E)
- Error monitoring (Sentry)

## 💰 Costs

**Free Tier (Development/Small Business):**
- Vercel: Free (100GB bandwidth/month)
- Supabase: Free tier (500MB database, 1GB storage)
- OpenAI: $5 free credits, then ~$10-20/month
- Google Vision: 1,000 requests/month free, then ~$1.50/1,000
- **Total**: ~$10-25/month after free credits

See [DEPLOYMENT.md](./DEPLOYMENT.md) for free tier deployment guide.

## 📝 License

Private project - All rights reserved

---

**Need help?** Check [SETUP_GUIDE.md](./SETUP_GUIDE.md) for setup instructions and troubleshooting.
