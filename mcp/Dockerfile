# =============================================================
# Flowerbed — MCP Hub Sidecar Container
# Placeholder for the Model Context Protocol tool hub.
# Install MCP tools here and register them with the Next.js app.
# Access internally at http://mcp-hub:3001
# =============================================================

FROM node:22-alpine
WORKDIR /app

# Install basic dependencies
RUN apk add --no-cache curl

# Placeholder — install MCP server packages here as tools are added.
# Example: npx @modelcontextprotocol/server-brave-search
# Example: npx @modelcontextprotocol/server-github

COPY package.json* ./
RUN if [ -f package.json ]; then npm install --production; fi

EXPOSE 3001

# Placeholder entrypoint — replace with actual MCP server command
CMD ["node", "-e", "const http = require('http'); const s = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ status: 'ok', service: 'mcp-hub', version: '0.1.0', message: 'MCP Hub placeholder — install your tools here.' })); }); s.listen(3001, () => console.log('MCP Hub listening on :3001'));"]
