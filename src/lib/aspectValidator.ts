import { AspectSchema } from "../types/aspectSchema";

/**
 * Validates and normalizes raw item specifics from AI against the strictly-typed aspect schema.
 * Rejects invalid SELECTION_ONLY aspects, fixes cardinality, and ensures exact casing.
 * 
 * Rules:
 * - SELECTION_ONLY with allowedValues: Only exact (case-insensitive) matches are kept, and normalized to the canonical casing.
 * - FREE_TEXT: Passed through as-is.
 * - MULTI: Ensure the value is an array. If string, wrap in array.
 * - SINGLE: Ensure the value is a string. If array, take the first element.
 * 
 * Returns a new object, leaving the input unmodified.
 */
/**
 * Normalizes an aspect key for comparison:
 *   1. Trims leading/trailing whitespace
 *   2. Collapses all internal whitespace sequences to a single space
 *   3. Lowercases
 *
 * This makes the key match tolerant of case drift and extra spaces without
 * risking false positives from edit-distance matching.
 *
 * Examples that now match:
 *   "CD  Grading" → "cd grading"  matches  "CD Grading" → "cd grading"
 *   "release title" → "release title"  matches  "Release Title" → "release title"
 *   " Format " → "format"  matches  "Format" → "format"
 */
function normalizeAspectKey(k: string): string {
    return k.trim().toLowerCase().replace(/\s+/g, " ");
}

export function validateAndNormalizeAspects(
    rawAspects: Record<string, string | string[]>,
    schema: AspectSchema
): Record<string, string | string[]> {
    const validated: Record<string, string | string[]> = {};

    // To preserve unknown extra fields Gemini generated (if any), we track what we've processed
    const processedKeys = new Set<string>();

    // 1. Iterate strictly over the Schema to guarantee all fields are present
    for (const aspectDef of schema) {
        // Find matching key using normalized comparison (case-insensitive + whitespace-collapsed)
        const normalizedSchemaKey = normalizeAspectKey(aspectDef.aspectName);
        const rawKey = Object.keys(rawAspects).find(
            k => normalizeAspectKey(k) === normalizedSchemaKey
        );

        if (rawKey) {
            processedKeys.add(rawKey);
        } else {
            // Debug log to trace what Gemini returned vs what schema expected 
            console.log(`[aspectValidator] Schema expected '${aspectDef.aspectName}', but Gemini did not provide it. Raw keys: `, Object.keys(rawAspects));
        }

        const value = rawKey ? rawAspects[rawKey] : null;
        const isMulti = aspectDef.cardinality === "MULTI";
        let normalizedValue: string | string[];

        // Normalize initial cardinality
        if (value === null || value === undefined || value === "") {
            normalizedValue = isMulti ? [] : "";
        } else if (isMulti) {
            normalizedValue = Array.isArray(value) ? value : [String(value)];
        } else {
            normalizedValue = Array.isArray(value) ? (value[0] !== undefined ? String(value[0]) : "") : String(value);
        }

        // 2. Mode Validation / Transformation
        if (aspectDef.mode === "SELECTION_ONLY" && aspectDef.allowedValues.length > 0) {
            const allowedLower = aspectDef.allowedValues.map(v => v.toLowerCase());

            if (Array.isArray(normalizedValue)) {
                // Filter array to only valid values, replacing with canonical casing
                const validArray = normalizedValue
                    .map(val => {
                        const index = allowedLower.indexOf(String(val).toLowerCase().trim());
                        if (index === -1) {
                            console.log(`[aspectValidator] Rejecting inner value '${val}' for '${aspectDef.aspectName}' because it is not in allowedValues [${aspectDef.allowedValues.join(", ")}]`);
                        }
                        return index !== -1 ? aspectDef.allowedValues[index] : null;
                    })
                    .filter((val): val is string => val !== null);

                if (validArray.length === 0 && aspectDef.required && normalizedValue.length > 0) {
                    console.warn(`[aspectValidator] Dropped values for REQUIRED aspect '${aspectDef.aspectName}' because none matched allowedValues.`);
                }
                validated[aspectDef.aspectName] = validArray;
            } else {
                // Single string check
                if (normalizedValue !== "") {
                    const index = allowedLower.indexOf(String(normalizedValue).toLowerCase().trim());
                    if (index !== -1) {
                        validated[aspectDef.aspectName] = aspectDef.allowedValues[index];
                    } else {
                        console.log(`[aspectValidator] Rejecting value '${normalizedValue}' for '${aspectDef.aspectName}' because it is not in allowedValues [${aspectDef.allowedValues.join(", ")}]`);
                        if (aspectDef.required) {
                            console.warn(`[aspectValidator] Dropped REQUIRED aspect '${aspectDef.aspectName}'. Value '${normalizedValue}' was not in allowedValues.`);
                        }
                        validated[aspectDef.aspectName] = "";
                    }
                } else {
                    validated[aspectDef.aspectName] = "";
                }
            }
        } else {
            // FREE_TEXT
            validated[aspectDef.aspectName] = normalizedValue;
        }
    }

    // 3. Keep any leftover raw fields that the schema didn't know about
    for (const [key, value] of Object.entries(rawAspects)) {
        if (!processedKeys.has(key)) {
            if (value !== null && value !== undefined && value !== "") {
                // If array that's empty, skip
                if (Array.isArray(value) && value.length === 0) continue;
                validated[key] = value;
            }
        }
    }

    return validated;
}
