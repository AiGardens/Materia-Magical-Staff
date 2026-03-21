/**
 * Materia Magical Staff — eBay Policies API Route
 *
 * GET /api/ebay/policies
 * Auth-protected. Fetches all three eBay account policy lists in parallel.
 * Used by the GlobalHeader to populate the shipping/return/payment selectors.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
    getFulfillmentPolicies,
    getReturnPolicies,
    getPaymentPolicies,
    EbayApiError,
} from "@/lib/ebayService";

export async function GET() {
    // Verify the session
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Fetch all three in parallel — one token refresh, three concurrent calls
        const [fulfillmentPolicies, returnPolicies, paymentPolicies] = await Promise.all([
            getFulfillmentPolicies(),
            getReturnPolicies(),
            getPaymentPolicies(),
        ]);

        return NextResponse.json({
            fulfillmentPolicies,
            returnPolicies,
            paymentPolicies,
        });
    } catch (error: any) {
        if (error instanceof EbayApiError || error?.name === "EbayApiError") {
            return NextResponse.json(
                {
                    error: error.message,
                    errorId: error.errorId,
                    category: error.category,
                    longMessage: error.longMessage,
                    parameters: error.parameters,
                },
                { status: error.statusCode ?? 502 }
            );
        }

        console.error("[/api/ebay/policies] Unexpected error:", error);
        return NextResponse.json(
            { error: "An unexpected error occurred while fetching eBay policies." },
            { status: 500 }
        );
    }
}
