# Materia Magical Staff — Fixes Implementation Plan
## Fix #1 + Fix #2 — Full Architecture & Step-by-Step Guide
_Written end of Session 22 for implementation in Session 23_

---

## Overview

Two independent, non-overlapping fixes. Both are required before the tool
can reliably process hundreds of items without human intervention.

| Fix | Problem | Root Cause | File(s) |
|-----|---------|-----------|---------|
| #1 | `SyntaxError: Unexpected end of JSON input` during analysis or publish | Every eBay API call blindly calls `response.json()` on the success path with zero protection against empty or malformed bodies | `src/lib/ebayService.ts` only |
| #2 | `error 25719: Aspect value cannot be null or empty` during inventory creation | Pipeline treats required and optional aspects identically; anti-hallucination rules prevent Gemini from filling required aspects; no self-healing fallback exists | `src/lib/aiPipeline.ts` only |

---

---

# FIX #1 — `ebayFetch<T>`: Safe Response Parsing with Auto-Retry

## Root Cause (Precise)

Every eBay API function in `ebayService.ts` follows this pattern:

```typescript
if (!response.ok) {
    throw await parseEbayError(response, "ctx"); // ← PROTECTED (try/catch inside)
}
const data = await response.json(); // ← COMPLETELY UNPROTECTED
```

`response.ok` only validates the HTTP status code (2xx). It says nothing about
whether the response body is valid, non-empty, or even present. A 200 OK with
an empty body throws `SyntaxError: Unexpected end of JSON input`. There is
no retry, no fallback, no recovery — the item fails immediately.

This pattern is duplicated **10 times** across the file. `parseEbayError`
(the error path) already has a `try/catch` inside it — the success path
ironically has less protection than the error path.

## The Fix: `ebayFetch<T>`

Add one new **private** (non-exported) function to `ebayService.ts`:

```
ebayFetch<T>(requestFn: () => Promise<Response>, context: string): Promise<T>
```

### Parameters
- `requestFn` — a zero-argument async function that performs the full HTTP
  request and returns a `Response`. Defined as a closure so it can call
  `getAccessToken()` internally, ensuring a fresh token on every retry.
- `context` — string label for error messages (e.g. `"getCategorySuggestions"`)

### Internal Logic (in order)

1. Call `requestFn()` to get a `Response`
2. If `!response.ok` → throw `parseEbayError(response, context)` as before
   (no change to error handling behaviour)
3. Read body as **raw text**: `const text = await response.text()`
   — this never throws, it always returns a string (possibly empty)
4. If `text.trim()` is empty → this is a bad response. Do NOT throw yet.
   Go to retry logic (step 7).
5. Try `JSON.parse(text)`. If it succeeds → return the parsed value as `T`.
6. If `JSON.parse` throws → this is a bad response. Go to retry logic (step 7).
7. **Retry:** wait `1500ms`, then loop back to step 1 (call `requestFn()` again).
8. After **3 total attempts** all fail → throw a new `EbayApiError` with:
   - Message: `"[context]: eBay returned an empty or malformed response after 3 attempts"`
   - `statusCode` from the last response
   - Log the first 300 characters of the raw text for debugging

### Retry count and delay
- Max attempts: **3**
- Delay between attempts: **1500ms** (fixed, no exponential needed — these
  are transient empty-body hiccups, not rate limits)
- Delay implementation: `await new Promise(r => setTimeout(r, 1500))`

### Special field validation (post-parse, before return)

Two functions currently do `return data.fieldName as string` without checking
the field exists. If the field is missing, TypeScript's `as` cast silently
returns `undefined` — a hidden type lie. After `ebayFetch` parses the JSON,
the CALLER must validate critical fields. Add guards in these two functions:

- **`publishOffer`**: after `ebayFetch`, verify `data.listingId` is a
  non-empty string. If not, throw `EbayApiError("publishOffer: response
  missing listingId", { statusCode: ... })`.
- **`createOffer`**: after `ebayFetch`, verify `data.offerId` is a
  non-empty string. If not, throw `EbayApiError("createOffer: response
  missing offerId", { statusCode: ... })`.

## Exact Replacement Map

Replace every unprotected `response.json()` call as follows.
The pattern to replace in each function is:

```typescript
// BEFORE (in each function):
const response = await fetch(url, options);
if (!response.ok) throw await parseEbayError(response, "ctx");
const data = await response.json();
```

```typescript
// AFTER (in each function):
const data = await ebayFetch<ExpectedShape>(
    () => fetch(url, options),
    "ctx"
);
```

Note: `getAccessToken()` is called inside the closure so retries get a
fresh token automatically if the previous one expired mid-batch.

### All 10 functions to update:

| Function | Return type hint for `<T>` |
|----------|---------------------------|
| `getAccessToken` (success path only — line 235) | `{ access_token: string; expires_in: number }` |
| `getFulfillmentPolicies` | `{ fulfillmentPolicies: FulfillmentPolicy[] }` |
| `getReturnPolicies` | `{ returnPolicies: ReturnPolicy[] }` |
| `getPaymentPolicies` | `{ paymentPolicies: PaymentPolicy[] }` |
| `getCategorySuggestions` | `{ categorySuggestions?: unknown[] }` |
| `getItemAspectsForCategory` | `{ aspects?: EbayAspect[] }` |
| `bulkCreateOrReplaceInventoryItem` | `{ responses: BulkItemResult[] }` |
| `bulkCreateOffer` | `{ responses: BulkOfferResult[] }` |
| `createOffer` | `{ offerId: string }` |
| `publishOffer` | `{ listingId: string }` |

`createInventoryLocation` is **NOT touched** — it expects 204 No Content
and never calls `response.json()`. It is already correct.

## What Does NOT Change

- All function signatures (names, parameters, return types) — identical
- All callers (`aiPipeline.ts`, `summon/route.ts`, etc.) — untouched
- `parseEbayError` — untouched
- `EbayApiError` class — untouched
- `validateBestOfferSettings`, `buildBestOfferTerms` — untouched

---

---

# FIX #2 — Self-Healing Required Aspects Pipeline

## Root Cause (Precise)

`AspectSchemaEntry` already has `required: boolean` (from
`src/types/aspectSchema.ts`). The pipeline knows which aspects are required.
The problem is it treats all aspects identically regardless of this flag.

Step 3.5 currently instructs Gemini:
> "Ask yourself: would I stake my reputation on this value being correct?
> If less than an immediate YES, return null."

This is correct behaviour for optional aspects. For required aspects, it is
catastrophically wrong — Gemini correctly refuses to guess, the field stays
empty, and eBay rejects the entire inventory item with error 25719.

Additionally, Step 3.5's strict rule causes optional aspects to be
under-populated too. A 70%-confident value for an optional aspect is still
useful to buyers and to eBay's search ranking.

## The Fix: Three-Layer Pipeline for Aspect Population

All three layers happen inside `src/lib/aiPipeline.ts` during the ANALYZE
phase. By the time the user sees the dashboard pre-summon, every required
aspect is guaranteed to have a value and optional aspects are as complete
as possible. Summon submits data that is already known-good.

### Layer 1 — Modify Step 3.5: Relax Optional Aspect Rules

**Current Step 3.5 philosophy:** "100% certain or omit"

**New Step 3.5 philosophy:** "Reasonable confidence — fill it"

Change the prompt to instruct Gemini:
- If you have a plausible, well-grounded answer for an aspect based on the
  product identity, provide it. You do not need to be 100% certain.
- Only omit aspects that are **genuinely unknowable** from the product
  information (e.g. a warranty field for a product with no visible warranty info).
- For SELECTION_ONLY aspects: pick the most likely value from allowedValues
  even if not perfectly certain.
- Anti-hallucination still applies to factual specifics (part numbers, exact
  dimensions) — do not invent precise numbers you cannot see. But for
  categorical fields like color, type, era, country → make your best call.

This improves optional aspect fill rates across the board without compromising
factual accuracy on fields where precision matters.

Step 3.5's fail-safe (if Gemini returns invalid JSON → `continue` with
current specifics) stays unchanged.

### Layer 2 — New Step 3.6: Required Aspects Targeted Self-Healing

**Runs after Step 3.5. Only activates if required aspects remain empty.**

```
Step 3.6 inputs:
  - itemIdentity (from Step 1)
  - aspectSchema (from Step 2)
  - currentItemSpecifics (merged output of Steps 3 + 3.5)

Step 3.6 logic:
  1. Filter aspectSchema for entries where:
       required === true
       AND currentItemSpecifics[aspectName] is empty/undefined/null
  2. If zero such aspects → skip Step 3.6 entirely (fast path)
  3. If any remain → build a dedicated Gemini prompt (see below)
  4. Retry up to 3 attempts if Gemini still returns empty for required fields
  5. Merge any new values into currentItemSpecifics (never overwrite existing)
```

**Step 3.6 Gemini prompt philosophy (critically different from 3.5):**

> "These aspects are REQUIRED by eBay. The listing WILL BE REJECTED if
> they are missing. You MUST provide a value for each one.
>
> For SELECTION_ONLY aspects: choose the single most likely value from
> the allowedValues list. You do not need certainty — pick the best fit.
> If none fit perfectly, pick the closest one. Returning nothing is not
> an option.
>
> For FREE_TEXT aspects: provide your best estimate. An educated guess
> based on the product type is acceptable and necessary."

Include in the prompt:
- Full `itemIdentity` text from Step 1 (provides product context)
- Only the still-empty REQUIRED aspects with their schemas
- SELECTION_ONLY fields: include full allowedValues list (truncated to 30
  if very long, same as existing Step 3 behaviour)

Retry logic for Step 3.6:
- Up to 3 attempts
- Between attempts: 1000ms delay
- On each attempt only re-request aspects that are still empty
- If all required aspects are filled on attempt 1 → don't attempt again

### Layer 3 — Step 3.7: Programmatic Absolute Fallback

**Runs after Step 3.6. Guarantees zero empty required aspects.**

For any required aspect that is STILL empty after Step 3.6:

**SELECTION_ONLY aspects:**
Scan `allowedValues` array (case-insensitive) for known generic values in
this priority order:
1. "Does not apply"
2. "Not Applicable"
3. "Unknown"
4. "Not Specified"
5. "Other"
6. "N/A"
7. "Unbranded"

Use the first match found. If none of the above exist in `allowedValues`,
use `allowedValues[0]` (the first available value in the list).

**FREE_TEXT aspects:**
Set value to `"Not Specified"`.

This layer is pure TypeScript — no Gemini call. It is deterministic,
instantaneous, and guarantees that every required aspect has a value
before the listing reaches summon.

**Log every Step 3.7 fallback at warn level:**
```
[Step 3.7 Fallback] aspectName="Country of Origin" → used generic fallback "Not Specified"
```
This makes it visible in logs when a fallback was used, without blocking the pipeline.

## Summary: Aspect Population Flow

```
Step 3  → Gemini fills aspects it's confident about (all aspects, unchanged)
Step 3.5 → Gemini fills remaining gaps with RELAXED rules (reasonable confidence ok)
Step 3.6 → Gemini fills REQUIRED gaps only with MANDATORY best-guess rules (retries x3)
Step 3.7 → Programmatic fallback fills any REQUIRED gaps still empty (deterministic)
Result  → Optional: as full as Gemini can reasonably make them
          Required: GUARANTEED 100% populated, always
```

## Files Affected

| File | Change |
|------|--------|
| `src/lib/aiPipeline.ts` | Modify Step 3.5 prompt, add Step 3.6 function, add Step 3.7 logic |
| `src/types/aspectSchema.ts` | **No changes** — `required: boolean` already exists |
| `src/lib/aspectParser.ts` | **No changes** — already parses `required` correctly |
| All other files | **No changes** |

## What Does NOT Change

- Step 1 (Vision Analysis) — untouched
- Step 2 (eBay Taxonomy fetch) — untouched
- Step 3 (main listing assembly) — untouched
- Step 4 (Offer Calculation) — untouched
- All callers (`processing-screen.tsx`, `pipeline/route.ts`) — untouched
- All publish/summon logic — untouched

---

---

# Implementation Order

Build in this order to keep each step independently testable:

1. **Fix #1** (`ebayService.ts`) — self-contained, no dependencies on Fix #2.
   Test: run a publish attempt; confirm no `SyntaxError` crashes even on
   transient eBay hiccups. Check logs for retry messages.

2. **Fix #2** (`aiPipeline.ts`) — self-contained, no dependencies on Fix #1.
   Test: analyze a batch including items in categories that previously
   produced 25719 errors (auto parts, movies, toys). Confirm all required
   aspects are populated in the dashboard before summon. Run summon and
   confirm zero 25719 errors.

3. **BUILD_LOG.md** — Add Session 23 entry documenting both fixes, the root
   causes, and the architectural decisions made.

---

# Acceptance Criteria

### Fix #1 is done when:
- No bare `response.json()` calls remain on the success path in `ebayService.ts`
- All 10 functions use `ebayFetch<T>` instead
- `publishOffer` and `createOffer` validate their critical return fields
- A transient empty eBay response retries silently and succeeds
- After 3 failed retries, a clear `EbayApiError` is thrown with raw body snippet

### Fix #2 is done when:
- No required aspect ever reaches eBay empty
- Step 3.7 fallback logs appear in terminal when used
- Optional aspects are visibly more complete in the dashboard than before
- Zero `error 25719` responses from eBay on any item in any category
- The entire 10-item batch (or larger) processes and publishes without human intervention
