import { getFulfillmentPolicies, getAccessToken } from "./src/lib/ebayService.ts";

async function main() {
    try {
        console.log("Getting Access Token...");
        const token = await getAccessToken();
        console.log("Token acquired, length:", token.length);

        console.log("Fetching policies...");
        const policies = await getFulfillmentPolicies();
        console.log("Success:", policies);
    } catch (err) {
        console.error("Error occurred:", err);
    }
}

main();
