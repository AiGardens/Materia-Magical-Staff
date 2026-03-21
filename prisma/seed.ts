/**
 * Materia Magical Staff — Database Seed Script
 *
 * Creates the single admin user if they don't exist.
 * Safe to re-run — uses upsert pattern.
 *
 * Usage: npm run db:seed
 *
 * Required env vars:
 *   SEED_USER_EMAIL    — admin login email
 *   SEED_USER_PASSWORD — admin login password (min 8 chars)
 *
 * Better Auth uses its own internal password hashing via the sign-up API.
 * We call the Better Auth HTTP endpoint directly rather than trying to use
 * internal APIs, which avoids coupling to private Better Auth internals.
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

// Load .env.local first, then .env
config({ path: ".env.local" });
config({ path: ".env" });

const db = new PrismaClient();

async function main() {
    const email = process.env.SEED_USER_EMAIL;
    const password = process.env.SEED_USER_PASSWORD;
    const appUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    if (!email || !password) {
        console.error(
            "❌  SEED_USER_EMAIL and SEED_USER_PASSWORD must be set in .env.local to run this script."
        );
        process.exit(1);
    }

    // Check if user already exists
    const existing = await db.user.findUnique({ where: { email } });

    if (existing) {
        console.log(`✅ Admin user already exists (id: ${existing.id}). Nothing to do.`);
        return;
    }

    console.log(`🌱 Seeding admin user: ${email}`);
    console.log(`   Calling Better Auth sign-up endpoint at ${appUrl}/api/auth/sign-up/email`);
    console.log(`   ⚠  Make sure the Next.js dev server is running at that URL.`);

    const response = await fetch(`${appUrl}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Admin",
            email,
            password,
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        console.error(`❌ Sign-up failed (${response.status}):`, body);
        process.exit(1);
    }

    const data = await response.json();
    console.log(`✅ Admin user created successfully!`);
    console.log(`   Email: ${email}`);
    console.log(`   User ID: ${data?.user?.id ?? "(check DB)"}`);
    console.log(`   You can now log in at /login with these credentials.`);
}

main()
    .catch((e) => {
        console.error("❌ Seed script failed:", e);
        process.exit(1);
    })
    .finally(() => {
        db.$disconnect();
    });
