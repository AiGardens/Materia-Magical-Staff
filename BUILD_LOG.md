# Materia Magical Staff - Build Log

This document serves as the permanent snapshot log of work completed across various chat sessions. New AI agents should reference this document to understand the established system design, rules, and current progress.

## Core Directives
* **Framework:** Next.js, Better Auth, Prisma (Postgres)
* **Architecture:** Docker-containerized, single web app container serving a local volume-mapped `/uploads` directory natively. The Postgres database MUST use a named data volume in `docker-compose.yml` (e.g., `postgres_data`) to perfectly persist data across container restarts and redeployments.
* **AI Engine:**
  * **Primary Pipeline (Steps 1-3):** `gemini-2.5-flash`
  * **Fallback / "Dig Deeper":** `gemini-2.5-pro`
* **Data Contract:** The `ListingObject` TypeScript interface. Every item flows strictly through this structure.
* **eBay Integration:** All specific API calls are strictly modeled after `EBAY_API_GUIDELINES.md` using the singular `src/lib/ebayService.ts` module. All interactions establish DRAFT listings only (`bulkCreateOrReplaceInventoryItem`, `bulkCreateOffer` without `publish`). Live activation must remain a manual action by the user in Seller Hub.

---

## Session Summaries

### Session 1: System Design & Milestone Planning
**Date:** March 6, 2026

**Status:** Completed Phase 0 (Planning).

**Accomplishments:**
* Cloned the foundational repository (`Flowerbed` template) and recognized its stack.
* Analyzed `EBAY_API_GUIDELINES.md` to define the 6-phase implementation plan.
* Defined the 4-step AI pipeline (1. Vision Grounding, 2. Category/Aspects Taxonomy, 3. Assembly, 4. Offer Calculation).
* Established extreme UI constraints: Retro video game UI, absolute un-clusterable rules, and absolute text-to-value overrides for manual input prices to bypass the AI generation logic.
* Set explicit requirement for a named Postgres volume ensuring DB durability across builds.

**Next Steps / Required Work:**
* **Commence Phase 1: Infrastructure & Foundation.**
  * Write `docker-compose.yml` (App Server + Postgres + Named Volume for persistent data).
  * Configure `next.config.ts` static image serving mapping.
  * Scaffold `.env.example` and `.env.local`.
  * Define the `ListingObject` TS interface explicitly.
