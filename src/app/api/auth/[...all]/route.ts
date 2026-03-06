/**
 * Flowerbed — Better Auth API Route Handler
 * Guardrail: This single route handles ALL auth operations.
 * Never write custom auth endpoints — delegate everything to Better Auth.
 */
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
