# Flowerbed — Dokploy Deployment Guide

This guide covers deploying a Flowerbed-based project to a Hetzner server using Dokploy.

---

## Prerequisites

- A Hetzner server with Dokploy installed
- A GitHub repository containing your Flowerbed project
- A domain name pointed at the server

---

## Step 1: Create a New Application in Dokploy

1. Log into your Dokploy dashboard
2. Click **Applications → New Application**
3. Select **Docker Compose** as the deployment type
4. Connect your GitHub account and select your Flowerbed repository
5. Set the **branch** to `main`
6. Set the **Docker Compose file** path to `docker-compose.yml`

---

## Step 2: Configure Environment Variables

In Dokploy's **Environment** tab for your application, add the following variables. These are your **real production secrets** — set them here and nowhere else.

```
NODE_ENV=production

DATABASE_URL=postgresql://flowerbed_user:<PASSWORD>@postgres:5432/flowerbed_db
POSTGRES_PASSWORD=<STRONG_RANDOM_PASSWORD>

BETTER_AUTH_SECRET=<32+ char random string — generate with: openssl rand -base64 32>
BETTER_AUTH_URL=https://yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com

RESEND_API_KEY=re_<your_resend_key>
EMAIL_FROM=no-reply@yourdomain.com

TRIGGER_SECRET_KEY=<your_trigger_key>

SENTRY_DSN=https://<your_sentry_dsn>

PLAUSIBLE_POSTGRES_PASSWORD=<STRONG_RANDOM_PASSWORD>
PLAUSIBLE_SECRET_KEY_BASE=<64 char random string>
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=yourdomain.com
PLAUSIBLE_BASE_URL=https://analytics.yourdomain.com
```

> **Security Rule**: Never commit real secrets to Git. They live only here in Dokploy.

---

## Step 3: Configure Domain & Proxy

1. In Dokploy, go to your application's **Domains** tab
2. Add your domain: `yourdomain.com`
3. Dokploy's built-in Traefik proxy will handle SSL (Let's Encrypt) automatically

For Plausible analytics, add a subdomain:
- Domain: `analytics.yourdomain.com` → pointing to the `plausible` service port `8000`

---

## Step 4: First Deployment

1. Click **Deploy** in Dokploy
2. Dokploy pulls your code from GitHub and runs `docker compose up`
3. Wait for all containers to show **Running** status:
   - `flowerbed-app-1` ✅
   - `flowerbed-postgres-1` ✅
   - `flowerbed-plausible-1` ✅
   - `flowerbed-mcp-hub-1` ✅

---

## Step 5: Run Database Migrations

After the first successful deployment, run the Prisma migration in the `app` container:

```bash
# In Dokploy → your app → Console tab, or via SSH:
docker exec -it flowerbed-app-1 npx prisma migrate deploy
```

This creates all database tables from your Prisma schema.

---

## Step 6: Verify

Visit `https://yourdomain.com` and confirm:
- [ ] Homepage loads
- [ ] `/login` page renders
- [ ] `/dashboard` redirects to `/login` (Bouncer working)
- [ ] `/api/bot/example` returns JSON
- [ ] Plausible shows a page view at `analytics.yourdomain.com`

---

## Continuous Deployment

Dokploy can auto-deploy on every push to `main`:

1. In Dokploy → your app → **Settings** tab
2. Enable **GitHub Webhooks / Auto Deploy**
3. Every `git push origin main` now triggers a fresh deployment

---

## Database Backups

Configure Dokploy to snapshot the `postgres-data` volume daily:
1. Dokploy → **Volumes** → `flowerbed_postgres-data`
2. Enable **Scheduled Backups**
3. Set retention to 7 days minimum

---

## Troubleshooting

| Issue | Fix |
|---|---|
| App container crashes on start | Check env vars — Zod will log exactly which key is missing |
| DB connection refused | Confirm `DATABASE_URL` uses service name `postgres`, not `localhost` |
| Emails not sending | Verify `RESEND_API_KEY` starts with `re_` and domain is verified in Resend |
| Plausible not tracking | Confirm `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` matches your actual domain |
