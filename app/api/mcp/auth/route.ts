/**
 * MCP OAuth flow — handles Dynamic Client Registration + PKCE
 * authorization URL generation + token exchange for Anthropic's
 * remote MCP servers (gmail.mcp.claude.com, etc.).
 *
 * Flow:
 *   1. POST /api/mcp/auth { action: "start", serverBaseUrl: "https://gmail.mcp.claude.com" }
 *      → Registers client dynamically → returns { authUrl, state }
 *
 *   2. Browser opens authUrl in popup → user authorizes → redirected to
 *      /api/mcp/auth?code=...&state=...
 *
 *   3. GET /api/mcp/auth?code=...&state=...
 *      → Exchanges code for token → returns HTML that posts token back
 *        to opener window via postMessage
 */

import { NextRequest } from "next/server";
import crypto from "crypto";

// In-memory store for pending OAuth flows (survives the request but
// not a server restart — fine for development; production should use
// a DB or encrypted cookie).
const pendingFlows = new Map<
  string,
  {
    serverBaseUrl: string;
    clientId: string;
    clientSecret: string;
    codeVerifier: string;
    redirectUri: string;
    createdAt: number;
  }
>();

// Clean up flows older than 10 minutes
function cleanupFlows() {
  const now = Date.now();
  for (const [state, flow] of pendingFlows) {
    if (now - flow.createdAt > 10 * 60 * 1000) pendingFlows.delete(state);
  }
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

/**
 * POST — start the OAuth flow (register client + generate auth URL)
 */
export async function POST(req: NextRequest) {
  cleanupFlows();

  const { action, serverBaseUrl } = (await req.json()) as {
    action: string;
    serverBaseUrl: string;
  };

  if (action !== "start" || !serverBaseUrl) {
    return Response.json({ error: "action=start and serverBaseUrl required" }, { status: 400 });
  }

  // 1. Fetch OAuth metadata
  const metaUrl = `${serverBaseUrl.replace(/\/mcp$/, "")}/.well-known/oauth-authorization-server`;
  let meta: Record<string, string>;
  try {
    const resp = await fetch(metaUrl);
    if (!resp.ok) {
      return Response.json({ error: `OAuth metadata fetch failed: ${resp.status}` }, { status: 502 });
    }
    meta = (await resp.json()) as Record<string, string>;
  } catch (e) {
    return Response.json(
      { error: `Cannot reach OAuth server: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 502 },
    );
  }

  const authEndpoint = meta.authorization_endpoint;
  const tokenEndpoint = meta.token_endpoint;
  const regEndpoint = meta.registration_endpoint;

  if (!authEndpoint || !tokenEndpoint) {
    return Response.json({ error: "OAuth metadata missing authorization or token endpoint" }, { status: 502 });
  }

  // 2. Dynamic Client Registration (if supported)
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/mcp/auth`;
  let clientId: string;
  let clientSecret = "";

  if (regEndpoint) {
    try {
      const regResp = await fetch(regEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Livepeer Storyboard",
          redirect_uris: [redirectUri],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "client_secret_post",
        }),
      });
      if (!regResp.ok) {
        const text = await regResp.text();
        return Response.json({ error: `Client registration failed: ${regResp.status}: ${text.slice(0, 200)}` }, { status: 502 });
      }
      const regData = (await regResp.json()) as Record<string, string>;
      clientId = regData.client_id;
      clientSecret = regData.client_secret || "";
    } catch (e) {
      return Response.json({ error: `Registration error: ${e instanceof Error ? e.message : "unknown"}` }, { status: 502 });
    }
  } else {
    return Response.json({ error: "MCP server does not support dynamic client registration" }, { status: 400 });
  }

  // 3. Generate PKCE challenge
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );
  const state = base64url(crypto.randomBytes(16));

  // Store flow state
  pendingFlows.set(state, {
    serverBaseUrl,
    clientId,
    clientSecret,
    codeVerifier,
    redirectUri,
    createdAt: Date.now(),
  });

  // 4. Build authorization URL
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  const authUrl = `${authEndpoint}?${params}`;

  return Response.json({ authUrl, state });
}

/**
 * GET — OAuth callback (exchange code for token, post back to opener)
 */
export async function GET(req: NextRequest) {
  cleanupFlows();

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return new Response(
      `<html><body><script>window.opener?.postMessage({type:"mcp-oauth-error",error:"${error}"},"*");window.close();</script><p>OAuth error: ${error}. You can close this window.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  if (!code || !state) {
    return new Response("Missing code or state", { status: 400 });
  }

  const flow = pendingFlows.get(state);
  if (!flow) {
    return new Response("Unknown or expired OAuth state", { status: 400 });
  }
  pendingFlows.delete(state);

  // Exchange code for token
  const baseUrl = flow.serverBaseUrl.replace(/\/mcp$/, "");
  const tokenUrl = `${baseUrl}/token`;

  try {
    const tokenResp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: flow.redirectUri,
        client_id: flow.clientId,
        client_secret: flow.clientSecret,
        code_verifier: flow.codeVerifier,
      }),
    });

    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      return new Response(
        `<html><body><script>window.opener?.postMessage({type:"mcp-oauth-error",error:"Token exchange failed: ${tokenResp.status}"},"*");window.close();</script><p>Token exchange failed. You can close this window.</p></body></html>`,
        { headers: { "Content-Type": "text/html" } },
      );
    }

    const tokenData = (await tokenResp.json()) as Record<string, string>;
    const accessToken = tokenData.access_token;

    // Post the token back to the opener window, which stores it in
    // the MCP store and marks the server as connected.
    return new Response(
      `<html><body><script>
        window.opener?.postMessage({
          type: "mcp-oauth-success",
          token: "${accessToken}",
          serverBaseUrl: "${flow.serverBaseUrl}"
        }, "*");
        window.close();
      </script><p>Connected! You can close this window.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  } catch (e) {
    return new Response(
      `<html><body><script>window.opener?.postMessage({type:"mcp-oauth-error",error:"${e instanceof Error ? e.message : "unknown"}"},"*");window.close();</script><p>Error. You can close this window.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }
}
