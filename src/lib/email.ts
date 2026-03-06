/**
 * Flowerbed — Resend Email Client Singleton
 * Guardrail: Use this singleton everywhere. Never instantiate Resend directly.
 */
import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);
