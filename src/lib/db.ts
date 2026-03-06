/**
 * Flowerbed — Prisma Client Singleton
 * Guardrail: Use this singleton everywhere. Never instantiate PrismaClient directly.
 * The global trick avoids exhausting connection pools during Next.js hot-reloads.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const db =
    globalForPrisma.prisma ??
    new PrismaClient({
        log:
            process.env.NODE_ENV === "development"
                ? ["query", "error", "warn"]
                : ["error"],
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = db;
}
