#!/usr/bin/env npx tsx
/**
 * Local Gmail MCP Server — HTTP JSON-RPC server that exposes Gmail
 * tools for the storyboard's daily briefing feature.
 *
 * Runs on localhost:3100. Connect from storyboard's MCP panel with
 * URL "http://localhost:3100/mcp" (no token needed — auth is handled
 * directly with Google).
 *
 * Setup:
 *   1. Create a Google Cloud project at console.cloud.google.com
 *   2. Enable the Gmail API
 *   3. Create OAuth 2.0 credentials (Desktop app type)
 *   4. Set env vars:
 *        GOOGLE_CLIENT_ID=<your-client-id>
 *        GOOGLE_CLIENT_SECRET=<your-client-secret>
 *   5. Run: npx tsx scripts/gmail-mcp-server.ts
 *   6. Visit http://localhost:3100/auth to authorize with Google
 *   7. In storyboard: Settings → MCP → Add Custom →
 *        Name: "Local Gmail"
 *        URL: "http://localhost:3100/mcp"
 *        Auth: None
 *        → Connect
 *
 * Tools exposed:
 *   gmail_search  — search emails by query (from, subject, after, etc.)
 *   gmail_read    — read a specific email by ID
 *   gmail_list    — list recent inbox emails
 */

import http from "http";
import { URL, URLSearchParams } from "url";

const PORT = parseInt(process.env.GMAIL_MCP_PORT || "3100", 10);
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = "https://www.googleapis.com/auth/gmail.readonly";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("ERROR: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.");
  console.error("See: https://console.cloud.google.com/apis/credentials");
  process.exit(1);
}

let accessToken = "";
let refreshToken = "";

// ---------------------------------------------------------------------------
// Google OAuth helpers
// ---------------------------------------------------------------------------

function authUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code: string): Promise<void> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const data = (await resp.json()) as Record<string, string>;
  if (data.error) throw new Error(`Token exchange: ${data.error_description || data.error}`);
  accessToken = data.access_token;
  if (data.refresh_token) refreshToken = data.refresh_token;
  console.log("✓ Google OAuth authorized. Gmail tools are now active.");
}

async function refreshAccessToken(): Promise<void> {
  if (!refreshToken) throw new Error("No refresh token — re-authorize at /auth");
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await resp.json()) as Record<string, string>;
  if (data.error) throw new Error(`Refresh failed: ${data.error}`);
  accessToken = data.access_token;
}

async function gmailFetch(path: string): Promise<unknown> {
  if (!accessToken) throw new Error("Not authorized — visit http://localhost:3100/auth");
  let resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 401 && refreshToken) {
    await refreshAccessToken();
    resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
  if (!resp.ok) throw new Error(`Gmail API ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// ---------------------------------------------------------------------------
// MCP tool implementations
// ---------------------------------------------------------------------------

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

const tools: ToolDef[] = [
  {
    name: "gmail_search",
    description: "Search emails by query. Use Gmail search syntax (from:, subject:, after:, before:, is:unread, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query, e.g. 'is:unread after:2026/04/15'" },
        max_results: { type: "number", description: "Max emails to return (default 10)" },
      },
      required: ["query"],
    },
    execute: async (args) => {
      const query = encodeURIComponent(args.query as string || "is:unread");
      const max = Math.min((args.max_results as number) || 10, 20);
      const data = (await gmailFetch(`messages?q=${query}&maxResults=${max}`)) as {
        messages?: Array<{ id: string; threadId: string }>;
        resultSizeEstimate?: number;
      };
      if (!data.messages?.length) return JSON.stringify({ emails: [], total: 0 });

      const emails = await Promise.all(
        data.messages.slice(0, max).map(async (m) => {
          const msg = (await gmailFetch(`messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)) as {
            id: string;
            snippet: string;
            payload?: { headers?: Array<{ name: string; value: string }> };
          };
          const headers = msg.payload?.headers || [];
          return {
            id: msg.id,
            from: headers.find((h) => h.name === "From")?.value || "",
            subject: headers.find((h) => h.name === "Subject")?.value || "",
            date: headers.find((h) => h.name === "Date")?.value || "",
            snippet: msg.snippet,
          };
        })
      );
      return JSON.stringify({ emails, total: data.resultSizeEstimate || emails.length });
    },
  },
  {
    name: "gmail_read",
    description: "Read a specific email by ID. Returns the full text body.",
    inputSchema: {
      type: "object",
      properties: {
        message_id: { type: "string", description: "Gmail message ID from gmail_search results" },
      },
      required: ["message_id"],
    },
    execute: async (args) => {
      const msg = (await gmailFetch(`messages/${args.message_id}?format=full`)) as {
        id: string;
        snippet: string;
        payload?: {
          headers?: Array<{ name: string; value: string }>;
          body?: { data?: string };
          parts?: Array<{ mimeType: string; body?: { data?: string } }>;
        };
      };
      const headers = msg.payload?.headers || [];
      let body = "";
      if (msg.payload?.body?.data) {
        body = Buffer.from(msg.payload.body.data, "base64url").toString("utf-8");
      } else if (msg.payload?.parts) {
        const textPart = msg.payload.parts.find((p) => p.mimeType === "text/plain");
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
        }
      }
      return JSON.stringify({
        id: msg.id,
        from: headers.find((h) => h.name === "From")?.value || "",
        subject: headers.find((h) => h.name === "Subject")?.value || "",
        date: headers.find((h) => h.name === "Date")?.value || "",
        body: body.slice(0, 2000),
      });
    },
  },
  {
    name: "gmail_list",
    description: "List recent inbox emails (last 24 hours). Good for daily briefings.",
    inputSchema: {
      type: "object",
      properties: {
        max_results: { type: "number", description: "Max emails to return (default 10)" },
      },
    },
    execute: async (args) => {
      const max = Math.min((args.max_results as number) || 10, 20);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const afterDate = `${yesterday.getFullYear()}/${String(yesterday.getMonth() + 1).padStart(2, "0")}/${String(yesterday.getDate()).padStart(2, "0")}`;
      const query = encodeURIComponent(`in:inbox after:${afterDate}`);
      const data = (await gmailFetch(`messages?q=${query}&maxResults=${max}`)) as {
        messages?: Array<{ id: string }>;
        resultSizeEstimate?: number;
      };
      if (!data.messages?.length) return JSON.stringify({ emails: [], total: 0, message: "Inbox is clear — no new emails in the last 24 hours." });

      const emails = await Promise.all(
        data.messages.slice(0, max).map(async (m) => {
          const msg = (await gmailFetch(`messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)) as {
            id: string;
            snippet: string;
            payload?: { headers?: Array<{ name: string; value: string }> };
          };
          const headers = msg.payload?.headers || [];
          return {
            id: msg.id,
            from: headers.find((h) => h.name === "From")?.value || "",
            subject: headers.find((h) => h.name === "Subject")?.value || "",
            date: headers.find((h) => h.name === "Date")?.value || "",
            snippet: msg.snippet,
          };
        })
      );
      return JSON.stringify({ emails, total: data.resultSizeEstimate || emails.length });
    },
  },
];

// ---------------------------------------------------------------------------
// HTTP server — JSON-RPC + OAuth routes + CORS
// ---------------------------------------------------------------------------

function cors(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // CORS preflight
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }

  // OAuth start
  if (url.pathname === "/auth") {
    res.writeHead(302, { Location: authUrl() });
    res.end();
    return;
  }

  // OAuth callback
  if (url.pathname === "/callback") {
    const code = url.searchParams.get("code");
    if (!code) { json(res, { error: "No code" }, 400); return; }
    try {
      await exchangeCode(code);
      cors(res);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body><h2>✓ Gmail authorized!</h2><p>You can close this window and return to Storyboard.</p></body></html>");
    } catch (e) {
      json(res, { error: (e as Error).message }, 500);
    }
    return;
  }

  // Health check
  if (url.pathname === "/health") {
    json(res, { status: "ok", authorized: !!accessToken, tools: tools.length });
    return;
  }

  // MCP JSON-RPC endpoint
  if (url.pathname === "/mcp" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let rpc: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
    try {
      rpc = JSON.parse(body);
    } catch {
      json(res, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
      return;
    }

    const respond = (result: unknown) => json(res, { jsonrpc: "2.0", id: rpc.id, result });
    const respondError = (code: number, message: string) =>
      json(res, { jsonrpc: "2.0", id: rpc.id, error: { code, message } });

    switch (rpc.method) {
      case "initialize":
        respond({
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "gmail-mcp", version: "1.0.0" },
        });
        return;

      case "tools/list":
        respond({
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
        return;

      case "tools/call": {
        const toolName = (rpc.params as Record<string, unknown>)?.name as string;
        const toolArgs = ((rpc.params as Record<string, unknown>)?.arguments || {}) as Record<string, unknown>;
        const tool = tools.find((t) => t.name === toolName);
        if (!tool) { respondError(-32602, `Unknown tool: ${toolName}`); return; }
        try {
          const result = await tool.execute(toolArgs);
          respond({ content: [{ type: "text", text: result }] });
        } catch (e) {
          respond({ content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true });
        }
        return;
      }

      default:
        respondError(-32601, `Method not found: ${rpc.method}`);
    }
    return;
  }

  // Root — info page
  if (url.pathname === "/") {
    cors(res);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<html><body>
      <h2>Gmail MCP Server</h2>
      <p>Status: ${accessToken ? "✓ Authorized" : "✗ Not authorized"}</p>
      <p>${accessToken ? "" : '<a href="/auth">→ Authorize with Google</a>'}</p>
      <p>Tools: ${tools.map((t) => t.name).join(", ")}</p>
      <p>MCP endpoint: <code>http://localhost:${PORT}/mcp</code></p>
      <p>Health: <a href="/health">/health</a></p>
    </body></html>`);
    return;
  }

  json(res, { error: "Not found" }, 404);
});

server.listen(PORT, () => {
  console.log(`\n📧 Gmail MCP Server running on http://localhost:${PORT}`);
  console.log(`\n1. Authorize: http://localhost:${PORT}/auth`);
  console.log(`2. In Storyboard: Settings → MCP → Add Custom`);
  console.log(`   Name: "Local Gmail"  URL: "http://localhost:${PORT}/mcp"  Auth: None`);
  console.log(`3. Type "give me my daily briefing" in the chat\n`);
});
