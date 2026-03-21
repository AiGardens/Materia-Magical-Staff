# eBay OAuth Complete Setup Guide (Windows & Mac)

This guide walks you through obtaining an **18-month Refresh Token** from eBay, specifically because the developer portal UI no longer directly provides them. You only need to do this process **ONCE**. After obtaining the Refresh Token, the app automatically generates short-lived access tokens behind the scenes.

## Prerequisites
1. An active [eBay Developer Account](https://developer.ebay.com/).
2. You must have already generated your **App ID (Client ID)** and **Cert ID (Client Secret)** for Production.
3. Node.js installed on your computer.

---

## Step 1: Create the Local Token Capture Script
Since the eBay portal doesn't give us the Refresh Token easily, we use a local Node.js script to catch it.

1. Open your project folder in your code editor or terminal.
2. Ensure your `.env` file contains your Client ID and Client Secret:
```env
EBAY_CLIENT_ID="your-client-id-here"
EBAY_CLIENT_SECRET="your-client-secret-here"
```
3. Create a file named `get-token.js` in the root of your project:

```javascript
import http from 'node:http';
import { URL } from 'node:url';

const CLIENT_ID = process.env.EBAY_CLIENT_ID;
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
// IMPORTANT: Replace this with your actual RuName from the eBay Developer Portal!
const RU_NAME = "Your_RuName_Here-sandbo-wouqisi"; 
const PORT = 3001;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ .env is missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET");
    process.exit(1);
}

// Full eBay scopes required for the app
const SCOPES = encodeURIComponent("https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.analytics.readonly https://api.ebay.com/oauth/api_scope/sell.finances https://api.ebay.com/oauth/api_scope/sell.payment.dispute https://api.ebay.com/oauth/api_scope/commerce.identity.readonly https://api.ebay.com/oauth/api_scope/sell.reputation https://api.ebay.com/oauth/api_scope/sell.reputation.readonly https://api.ebay.com/oauth/api_scope/commerce.notification.subscription https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly");

const AUTH_URL = `https://auth.ebay.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${RU_NAME}&scope=${SCOPES}`;

console.log("\n==================================");
console.log("🚀 Click this link to authorize:");
console.log(AUTH_URL);
console.log("==================================\n");
console.log(`⏳ Waiting for eBay to redirect back...`);

const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '', `http://localhost:${PORT}`);
    
    if (reqUrl.pathname === '/callback') {
        const code = reqUrl.searchParams.get('code');
        
        if (!code) { res.writeHead(400); res.end("Failure."); return; }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write('<h2>Authorization successful! Check your terminal for the Refresh Token.</h2><p>You can close this window.</p>');
        res.end();

        const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
        
        try {
            const tokenResponse = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Authorization: `Basic ${credentials}`,
                },
                body: new URLSearchParams({ grant_type: "authorization_code", code: decodeURIComponent(code), redirect_uri: RU_NAME }).toString(),
            });

            const data = await tokenResponse.json();
            if (tokenResponse.ok) {
                console.log("🎉 SUCCESS! Your Refresh Token:\n\n", data.refresh_token, "\n");
            }
        } catch(e) { console.error("Network error:", e); }
        setTimeout(() => process.exit(0), 1000);
    } else { res.writeHead(404); res.end(); }
});

server.listen(PORT, () => {});
```

---

## Step 2: Create a Secure Tunnel (Bypass HTTPS restriction)
eBay requires the redirect URL (`RuName`) to be an `https://` address, so `http://localhost` will be rejected. We use a tool called `localtunnel` to create a temporary secure link.

1. Open a terminal (Mac) or command prompt/PowerShell (Windows).
2. Navigate to your project folder.
3. Run the following command exactly as written:
   * **Mac:** `npx localtunnel --port 3001`
   * **Windows:** `npx localtunnel --port 3001`
   *(Press `y` and Enter if it asks to proceed)*
4. The terminal will output your temporary secure URL (e.g., `https://some-random-words.loca.lt`). **Copy this URL.** Do not close this terminal tab!

---

## Step 3: Configure eBay Developer Portal
1. Go to your [eBay Developer Portal -> User Tokens page](https://developer.ebay.com/my/auth/tokens).
2. Scroll to the "Get a Token from eBay via Your Application" section.
3. Paste the URL you just copied into the **"Your auth accepted URL"** field.
4. Add `/callback` to the end of the URL (e.g., `https://some-random-words.loca.lt/callback`).
5. Click **Save** on the right side.

---

## Step 4: Run the Script and Authorize
1. Open a **SECOND** new terminal/command prompt window.
2. Navigate to your project folder.
3. Run the script:
   * **Mac & Windows:** `node --env-file=".env" get-token.js`
4. The terminal will print a large URL starting with `https://auth.ebay.com...`
5. Click that link!
   * **Mac:** Hold `Cmd ⌘` and click the link.
   * **Windows:** Hold `Ctrl` and click the link.

---

## Step 5: (Optional) Bypassing the Anti-Phishing Screen
Because you are using localtunnel, your web browser might block the redirect with a warning screen (`Tunnel password required`). If you see this:
1. On that warning page, click the small blue link labeled `https://loca.lt/mytunnelpassword`.
2. A small page will open displaying your public IP address (e.g. `70.12.34.56`).
3. Copy that IP address.
4. Go back to the warning screen, paste the IP address into the **Tunnel Password** box, and click **Submit**.
5. Once submitted, return to the terminal and click the `https://auth.ebay.com...` link *again* to restart the flow.

## Step 6: Get Your Token!
1. Sign in to your eBay Seller account.
2. Click **Agree** to grant your application permissions.
3. eBay will redirect you to your localtunnel URL.
4. Look at the terminal window where your script is running. It will instantly print out your massive **Refresh Token**! 
5. Copy the entire token string, paste it into your `.env` file as `EBAY_REFRESH_TOKEN`, save the file, and restart your main development server (`npm run dev`).

You are permanently authenticated! You can safely delete the `get-token.js` file.
