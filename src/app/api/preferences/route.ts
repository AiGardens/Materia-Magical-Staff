/**
 * Materia Magical Staff — User Preferences API Route
 *
 * GET  /api/preferences — Returns the current user's GlobalPreference (or defaults)
 * PUT  /api/preferences — Upserts the current user's GlobalPreference
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";

const DEFAULT_PREFERENCES = {
    shippingPolicyId: null,
    returnPolicyId: null,
    paymentPolicyId: null,
    acceptOffers: true,
    autoAcceptThreshold: 10,
};

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prefs = await db.globalPreference.findUnique({
        where: { userId: session.user.id },
    });

    return NextResponse.json(prefs ?? { ...DEFAULT_PREFERENCES, userId: session.user.id });
}

export async function PUT(req: NextRequest) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Partial<{
        shippingPolicyId: string | null;
        returnPolicyId: string | null;
        paymentPolicyId: string | null;
        acceptOffers: boolean;
        autoAcceptThreshold: number;
    }>;

    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (
        body.autoAcceptThreshold !== undefined &&
        body.autoAcceptThreshold !== null &&
        (body.autoAcceptThreshold < 0 || body.autoAcceptThreshold > 100)
    ) {
        return NextResponse.json(
            { error: "autoAcceptThreshold must be between 0 and 100" },
            { status: 400 }
        );
    }

    const prefs = await db.globalPreference.upsert({
        where: { userId: session.user.id },
        create: {
            userId: session.user.id,
            shippingPolicyId: body.shippingPolicyId ?? null,
            returnPolicyId: body.returnPolicyId ?? null,
            paymentPolicyId: body.paymentPolicyId ?? null,
            acceptOffers: body.acceptOffers ?? true,
            autoAcceptThreshold: body.autoAcceptThreshold ?? 10,
        },
        update: {
            ...(body.shippingPolicyId !== undefined && { shippingPolicyId: body.shippingPolicyId }),
            ...(body.returnPolicyId !== undefined && { returnPolicyId: body.returnPolicyId }),
            ...(body.paymentPolicyId !== undefined && { paymentPolicyId: body.paymentPolicyId }),
            ...(body.acceptOffers !== undefined && { acceptOffers: body.acceptOffers }),
            ...(body.autoAcceptThreshold !== undefined && { autoAcceptThreshold: body.autoAcceptThreshold }),
        },
    });

    return NextResponse.json(prefs);
}
