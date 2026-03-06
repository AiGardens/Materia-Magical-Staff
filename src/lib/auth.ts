/**
 * Flowerbed — Better Auth (Server-Side Configuration)
 * Guardrail: This is the server-side auth config. Never import this in client components.
 * Use `auth-client.ts` for client-side usage.
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { db } from "@/lib/db";
import { resend } from "@/lib/email";

export const auth = betterAuth({
    database: prismaAdapter(db, {
        provider: "postgresql",
    }),

    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        sendResetPassword: async ({ user, url }) => {
            await resend.emails.send({
                from: process.env.EMAIL_FROM!,
                to: user.email,
                subject: "Reset your Flowerbed password",
                html: `<p>Click <a href="${url}">here</a> to reset your password. This link expires in 1 hour.</p>`,
            });
        },
    },

    emailVerification: {
        sendVerificationEmail: async ({ user, url }) => {
            await resend.emails.send({
                from: process.env.EMAIL_FROM!,
                to: user.email,
                subject: "Verify your Flowerbed email",
                html: `<p>Welcome! Click <a href="${url}">here</a> to verify your email address.</p>`,
            });
        },
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
    },

    plugins: [
        magicLink({
            sendMagicLink: async ({ email, url }) => {
                await resend.emails.send({
                    from: process.env.EMAIL_FROM!,
                    to: email,
                    subject: "Your Flowerbed magic link",
                    html: `<p>Click <a href="${url}">here</a> to sign in. This link expires in 15 minutes.</p>`,
                });
            },
        }),
    ],

    trustedOrigins: [process.env.BETTER_AUTH_URL!],
});

export type Session = typeof auth.$Infer.Session;
