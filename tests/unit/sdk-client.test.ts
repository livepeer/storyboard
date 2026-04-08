import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig, saveConfig } from "@/lib/sdk/client";

describe("SDK Client", () => {
  beforeEach(() => {
    // Mock localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
  });

  describe("loadConfig", () => {
    it("returns defaults when localStorage is empty", () => {
      const config = loadConfig();
      expect(config.serviceUrl).toBe("https://sdk-a3-staging-1.daydream.monster");
      expect(config.apiKey).toBe("");
      expect(config.orchUrl).toBe("");
    });

    it("reads from localStorage", () => {
      localStorage.setItem("sdk_service_url", "https://custom.example.com");
      localStorage.setItem("sdk_api_key", "sk_test_123");

      const config = loadConfig();
      expect(config.serviceUrl).toBe("https://custom.example.com");
      expect(config.apiKey).toBe("sk_test_123");
    });
  });

  describe("saveConfig", () => {
    it("persists config to localStorage", () => {
      saveConfig({
        serviceUrl: "https://new.example.com",
        apiKey: "sk_new",
        orchUrl: "https://orch.example.com",
      });

      expect(localStorage.getItem("sdk_service_url")).toBe(
        "https://new.example.com"
      );
      expect(localStorage.getItem("sdk_api_key")).toBe("sk_new");
      expect(localStorage.getItem("orch_url")).toBe(
        "https://orch.example.com"
      );
    });
  });
});
