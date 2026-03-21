import http from 'node:http';
import { URL } from 'node:url';

const CLIENT_ID = process.env.EBAY_CLIENT_ID;
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const RU_NAME = "Anthony_Neto-AnthonyN-sandbo-wouqisi";
const PORT = 3001;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ .env is missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET");
    process.exit(1);
}

const SCOPES = encodeURIComponent("https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.analytics.readonly https://api.ebay.com/oauth/api_scope/sell.finances https://api.ebay.com/oauth/api_scope/sell.payment.dispute https://api.ebay.com/oauth/api_scope/commerce.identity.readonly https://api.ebay.com/oauth/api_scope/sell.reputation https://api.ebay.com/oauth/api_scope/sell.reputation.readonly https://api.ebay.com/oauth/api_scope/commerce.notification.subscription https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly");

const AUTH_URL = `https://auth.ebay.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${RU_NAME}&scope=${SCOPES}`;

console.log("\n==================================");
console.log("🚀 STEP 1: Click this link to authorize:");
console.log(AUTH_URL);
console.log("==================================\n");
console.log(`⏳ Waiting for eBay to redirect back to http://localhost:${PORT}/callback ...\n`);

const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '', `http://localhost:${PORT}`);

    if (reqUrl.pathname === '/callback') {
        const code = reqUrl.searchParams.get('code');

        if (!code) {
            res.writeHead(400);
            res.end("Failure: No code received in URL.");
            return;
        }

        console.log("✅ Received authorization code from eBay!");
        console.log("🔄 Exchanging code for Refresh Token...\n");

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write('<h2>Authorization successful! Check your terminal for the Refresh Token.</h2><p>You can close this window.</p>');
        res.end();

        // Exchange for token
        const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

        try {
            const tokenResponse = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Authorization: `Basic ${credentials}`,
                },
                body: new URLSearchParams({
                    grant_type: "authorization_code",
                    code: decodeURIComponent(code),
                    redirect_uri: RU_NAME,
                }).toString(),
            });

            const data = await tokenResponse.json();

            if (!tokenResponse.ok) {
                console.error("❌ Failed to exchange token:", data);
            } else {
                console.log("🎉 SUCCESS! Here is your Refresh Token:\n");
                console.log("==========================================================");
                console.log(data.refresh_token);
                console.log("==========================================================\n");
                console.log("Copy the string above and paste it into EBAY_REFRESH_TOKEN in your .env file!");
            }
        } catch (e) {
            console.error("❌ Network error:", e);
        }

        // Close server
        setTimeout(() => process.exit(0), 1000);
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => { });
