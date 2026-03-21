"use client";

/**
 * Materia Magical Staff — Main Dashboard
 *
 * Client Component — required so next/dynamic can use ssr:false.
 * Auth enforced by middleware.ts (redirects to /login if no session).
 *
 * Phase 3: Wrapped in GalleryProvider. Shows UploadZone + ListingGallery.
 * Phase 4: Adds Process button + ProcessingScreen pipeline integration.
 * Phase 5: ReviewDashboard replaces debug JSON after pipeline completes.
 * Phase 6: Passes full globalPrefs (including policy IDs) to SummonButton.
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import { GalleryProvider, useGallery } from "@/lib/gallery-store";
import type { ListingObject } from "@/types";

const GlobalHeader = dynamic(
  () => import("@/components/global-header").then(m => m.GlobalHeader),
  { ssr: false }
);

const UploadZone = dynamic(
  () => import("@/components/upload-zone").then(m => m.UploadZone),
  { ssr: false }
);

const ListingGallery = dynamic(
  () => import("@/components/listing-gallery").then(m => m.ListingGallery),
  { ssr: false }
);

const WelcomeScreen = dynamic(
  () => import("@/components/welcome-screen").then(m => m.WelcomeScreen),
  { ssr: false }
);

const ProcessingScreen = dynamic(
  () => import("@/components/processing-screen").then(m => m.ProcessingScreen),
  { ssr: false }
);

const ReviewDashboard = dynamic(
  () => import("@/components/review-dashboard").then(m => m.ReviewDashboard),
  { ssr: false }
);

const SummonButton = dynamic(
  () => import("@/components/summon-button").then(m => m.SummonButton),
  { ssr: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// Global prefs shape (mirrors DB / API response)
// ─────────────────────────────────────────────────────────────────────────────

interface GlobalPrefs {
  acceptOffers: boolean;
  autoAcceptThreshold: number | null;
  // Phase 6: policy IDs needed by SummonButton → /api/summon
  shippingPolicyId: string | null;
  returnPolicyId: string | null;
  paymentPolicyId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inner dashboard content (must be inside GalleryProvider)
// ─────────────────────────────────────────────────────────────────────────────

interface DashboardContentProps {
  globalPrefs: GlobalPrefs;
}

function DashboardContent({ globalPrefs }: DashboardContentProps) {
  const { images, clusters, setListings } = useGallery();
  const isEmpty = images.length === 0 && clusters.length === 0;

  const [isProcessing, setIsProcessing] = useState(false);
  const [processedListings, setProcessedListings] = useState<ListingObject[]>([]);

  const hasWorkToProcess =
    !isProcessing &&
    (images.length > 0 || clusters.length > 0);

  // Build the list of clusters to process:
  // Each ungrouped image becomes its own single-image cluster,
  // carrying its userNotes and priceOverride forward into the pipeline.
  const clustersToProcess = [
    ...clusters,
    ...images.map(img => ({
      id: img.id,
      images: [img],
      mainImageId: img.id,
      userNotes: img.userNotes,
      priceOverride: img.priceOverride,
    })),
  ];

  function handleStartProcessing() {
    if (clustersToProcess.length === 0) return;
    setIsProcessing(true);
  }

  function handlePipelineComplete(listings: ListingObject[]) {
    setProcessedListings(listings);
    setListings(listings);
    setIsProcessing(false);
  }

  return (
    <>
      {/* Processing overlay — covers viewport while pipeline runs */}
      {isProcessing && (
        <ProcessingScreen
          clusters={clustersToProcess}
          globalPrefs={globalPrefs}
          onComplete={handlePipelineComplete}
        />
      )}

      <UploadZone />

      {isEmpty ? (
        <WelcomeScreen />
      ) : (
        <>
          <ListingGallery />

          {/* ── Process Button ──────────────────────────────────────── */}
          {hasWorkToProcess && (
            <div style={{ textAlign: "center", margin: "2rem 0" }}>
              <button
                className="pixel-btn pixel-btn-emerald-ghost portal-title-text"
                style={{ fontSize: 16, padding: "16px 36px" }}
                onClick={handleStartProcessing}
              >
                ◆ ANALYZE {clustersToProcess.length} ITEM{clustersToProcess.length !== 1 ? "S" : ""} ◆
              </button>
            </div>
          )}

          {/* ── Review Dashboard ────────────────────────────────── */}
          {processedListings.length > 0 && !isProcessing && (
            <>
              <ReviewDashboard />
              {/* ── Summon to eBay (Phase 6) ───────────────────── */}
              <SummonButton
                globalPrefs={
                  globalPrefs.shippingPolicyId &&
                    globalPrefs.returnPolicyId &&
                    globalPrefs.paymentPolicyId
                    ? {
                      shippingPolicyId: globalPrefs.shippingPolicyId,
                      returnPolicyId: globalPrefs.returnPolicyId,
                      paymentPolicyId: globalPrefs.paymentPolicyId,
                    }
                    : null
                }
              />
            </>
          )}
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page root — owns globalPrefs so both GlobalHeader and SummonButton stay in sync
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [globalPrefs, setGlobalPrefs] = useState<GlobalPrefs>({
    acceptOffers: false,
    autoAcceptThreshold: null,
    shippingPolicyId: null,
    returnPolicyId: null,
    paymentPolicyId: null,
  });

  return (
    <GalleryProvider>
      <div className="retro-body" style={{ minHeight: "100vh" }}>
        <GlobalHeader onPrefsChange={(p) => setGlobalPrefs({
          shippingPolicyId: p.shippingPolicyId,
          returnPolicyId: p.returnPolicyId,
          paymentPolicyId: p.paymentPolicyId,
          acceptOffers: p.acceptOffers,
          autoAcceptThreshold: p.autoAcceptThreshold ?? null,
        })} />
        <main style={{ padding: "2rem", maxWidth: 1400, margin: "0 auto" }}>
          <DashboardContent globalPrefs={globalPrefs} />
        </main>
      </div>
    </GalleryProvider>
  );
}
