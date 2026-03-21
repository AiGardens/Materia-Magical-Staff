import { AspectSchema, AspectSchemaEntry } from "../types/aspectSchema";

/**
 * Parses the raw eBay getItemAspectsForCategory response into a strictly-typed AspectSchema.
 * This is a pure function with no side effects.
 * 
 * Extracts:
 *   aspects[].localizedAspectName           → aspectName
 *   aspects[].aspectConstraint.aspectRequired   → required (boolean)
 *   aspects[].aspectConstraint.aspectUsage      → usage
 *   aspects[].aspectConstraint.aspectMode       → mode
 *   aspects[].aspectConstraint.itemToAspectCardinality → cardinality
 *   aspects[].aspectValues[].localizedValue     → allowedValues array
 */
export function parseAspectSchema(rawAspectsResponse: unknown): AspectSchema {
    let aspectsArray: any[] = [];

    if (Array.isArray(rawAspectsResponse)) {
        // If it's already an array (e.g. from getItemAspectsForCategory returning data.aspects)
        aspectsArray = rawAspectsResponse;
    } else if (rawAspectsResponse && typeof rawAspectsResponse === "object") {
        // If it's the raw wrapped response
        const response = rawAspectsResponse as { aspects?: any[] };
        if (Array.isArray(response.aspects)) {
            aspectsArray = response.aspects;
        }
    }

    if (aspectsArray.length === 0) {
        return [];
    }

    return aspectsArray.map((aspect): AspectSchemaEntry => {
        const aspectName = typeof aspect?.localizedAspectName === "string" ? aspect.localizedAspectName : "";

        const constraint = aspect?.aspectConstraint || {};
        const required = !!constraint.aspectRequired;
        const usage = typeof constraint.aspectUsage === "string" ? constraint.aspectUsage : "";
        const mode = typeof constraint.aspectMode === "string" ? constraint.aspectMode : "";
        const cardinality = typeof constraint.itemToAspectCardinality === "string" ? constraint.itemToAspectCardinality : "SINGLE";

        let allowedValues: string[] = [];
        if (Array.isArray(aspect?.aspectValues)) {
            allowedValues = aspect.aspectValues
                .filter((val: any) => val && typeof val.localizedValue === "string")
                .map((val: any) => val.localizedValue);
        }

        return {
            aspectName,
            required,
            usage,
            mode,
            allowedValues,
            cardinality
        };
    });
}
