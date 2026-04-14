import { describe, it, expect, vi, beforeEach } from "vitest";
import { HostedSdkClient } from "../../../src/capabilities/client.js";

const BASE_URL = "https://sdk.example.test";
const API_KEY = "sk_test_12345";

function makeClient() {
  return new HostedSdkClient({ baseUrl: BASE_URL, apiKey: API_KEY });
}

describe("HostedSdkClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("createSession POSTs to /agent/session and returns session_id", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: "abc123xyz" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = makeClient();
    const result = await client.createSession();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/agent/session`);
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe(`Bearer ${API_KEY}`);
    expect(result.session_id).toBe("abc123xyz");
  });

  it("enrich POSTs to /agent/enrich with session_id and raw_prompt", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ prompt: "anime, fox. in a forest" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = makeClient();
    const result = await client.enrich("sid-42", "in a forest");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/agent/enrich`);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ session_id: "sid-42", raw_prompt: "in a forest" });
    expect(result.prompt).toContain("in a forest");
  });

  it("throws an Error with status and body on non-2xx response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Unknown session",
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = makeClient();
    await expect(
      client.setContext("no-such-session", { style: "anime" })
    ).rejects.toThrow("404");
  });
});
