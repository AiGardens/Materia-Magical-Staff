<div align="center">

# 🌸 Flowerbed

**The Elite Next.js Web Pipeline Template**

A production-grade, reusable foundation by **AI Gardens**.
Every project starts here.

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?style=flat-square&logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=flat-square&logo=prisma)
![Better Auth](https://img.shields.io/badge/Better_Auth-1.4-purple?style=flat-square)

</div>

---

## Philosophy

Flowerbed is not a starter kit. It is a **backbone** — a set of non-negotiable, pre-wired infrastructure pieces that every serious project shares. Spin up a new project, clone this template, and your first commit is already production-ready.

Built with four core guardrails:

| Guardrail | What it means |
|---|---|
| **Server Actions First** | All data mutations use Next.js Server Actions — discoverable by humans and AI agents |
| **Default-Deny Security** | All routes are private by default. Public routes must be explicitly whitelisted |
| **Fail-Fast Validation** | App refuses to start if any required environment variable is missing |
| **Machine Legibility** | JSON-LD on all pages + a `/api/bot/` gateway for AI agent consumption |

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | PostgreSQL 16 via Prisma 7 |
| Auth | Better Auth (email/password + magic link) |
| Email | Resend + React Email |
| Background Jobs | Trigger.dev v3 |
| Error Monitoring | Sentry |
| Analytics | Plausible (self-hosted) |
| Testing | Vitest (unit) + Playwright (E2E) |
| Infra | Docker Compose + Dokploy |

---

## Using This Template for a New Project

### 1. Clone and rename

```bash
git clone https://github.com/ai-gardens/flowerbed my-new-project
cd my-new-project
npm install
```

### 2. Set up your environment

```bash
cp .env.example .env
# Edit .env and fill in your real values
```

### 3. Start the database

```bash
docker compose up -d postgres
npm run db:push   # Creates all tables
```

### 4. Run the dev server

```bash
npm run dev
# → http://localhost:3000
```

### 5. Wire up external services (one-time per project)

```bash
# Background jobs
npx trigger.dev@latest init

# Error monitoring
npx @sentry/wizard@latest -i nextjs
```

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...all]/   ← Better Auth handler
│   │   └── bot/example/     ← AI Agent Bot Gateway
│   ├── layout.tsx           ← Env validation + Plausible + JSON-LD
│   └── page.tsx
├── components/
│   ├── seo/JsonLd.tsx       ← Schema.org injector
│   └── ui/                  ← shadcn/ui components
├── emails/
│   └── WelcomeEmail.tsx     ← React Email template
├── generated/prisma/        ← Auto-generated (gitignored)
├── lib/
│   ├── auth.ts              ← Better Auth server config
│   ├── auth-client.ts       ← Better Auth client config
│   ├── db.ts                ← Prisma singleton
│   ├── email.ts             ← Resend singleton
│   ├── env.ts               ← Zod env validation (fail-fast)
│   └── utils.ts             ← shadcn helpers
└── middleware.ts             ← Default-Deny Bouncer
```

---

## Security Model — The "Bouncer"

`src/middleware.ts` is the enforcement layer. It runs on **every request**.

**Default-Deny:** If a route is not on the whitelist, unauthenticated users are redirected to `/login`.

**Current public whitelist:**
```
/                    ← Homepage
/login               ← Auth pages
/signup
/api/auth/**         ← Better Auth endpoints
/api/bot/**          ← AI Agent Gateway (intentionally public)
/_next/**            ← Next.js internals
/favicon.ico, robots.txt, sitemap.xml
```

To make a new route public, add it to the `PUBLIC_PATHS` array in `middleware.ts`.

---

## AI Agent Readiness

Every page has a `<JsonLd>` component injecting **Schema.org structured data** — readable by AI crawlers and agents without needing to parse HTML.

The `/api/bot/` directory is a dedicated, always-public gateway for AI agents. It returns clean JSON with zero HTML overhead.

---

## Available Scripts

```bash
npm run dev               # Start dev server
npm run build             # Production build
npm run lint              # ESLint check
npm run test:unit         # Vitest unit tests
npm run test:unit:watch   # Vitest watch mode
npm run test:e2e          # Playwright E2E tests
npm run test:e2e:ui       # Playwright interactive UI
npm run db:generate       # Regenerate Prisma Client
npm run db:migrate        # Create + apply a new DB migration
npm run db:studio         # Open Prisma Studio (visual DB browser)
npm run email:dev         # Preview React Email templates
```

---

## Environment Variables Reference

See `.env.example` for the full list with descriptions. Every variable is validated by Zod at boot time (`src/lib/env.ts`). The app will not start if any required value is missing.

**Real secrets belong only in Dokploy's environment variable panel — never in code.**

---

## Maintenance

| Task | Frequency | Command |
|---|---|---|
| Check shadcn/ui updates | Monthly | `npx shadcn@latest diff` |
| Security audit | Weekly | `npm audit` |
| Prisma Client update | With Prisma releases | `npm update prisma && npm run db:generate` |
| Review Sentry alerts | Monthly | Sentry dashboard |

---

<div align="center">
Built with 🌸 by <strong>AI Gardens</strong>
</div>
