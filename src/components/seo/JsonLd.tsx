/**
 * Flowerbed — JSON-LD Structured Data Component
 * Guardrail: Include this component on every page for AI/bot legibility.
 * Pass any Schema.org object as `data`. It renders as a <script type="application/ld+json">
 * tag in the document head, invisible to humans but readable by crawlers and AI agents.
 * 
 * @example
 * <JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", name: "My App" }} />
 */

interface JsonLdProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: Record<string, any>;
}

export function JsonLd({ data }: JsonLdProps) {
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
    );
}
