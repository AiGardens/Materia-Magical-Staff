export interface AspectSchemaEntry {
    aspectName: string;
    required: boolean;          // from aspectConstraint.aspectRequired
    usage: string;              // "RECOMMENDED" | "OPTIONAL" | etc.
    mode: string;               // "SELECTION_ONLY" | "FREE_TEXT"
    allowedValues: string[];    // from aspectValues[].localizedValue (may be empty)
    cardinality: string;        // "SINGLE" | "MULTI"
}

export type AspectSchema = AspectSchemaEntry[];
