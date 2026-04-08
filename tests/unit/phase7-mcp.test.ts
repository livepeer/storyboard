import { describe, it, expect, beforeEach } from "vitest";
import {
  getMcpServers,
  addMcpServer,
  removeMcpServer,
  connectServer,
  disconnectServer,
  getConnectedServers,
  clearMcpServers,
} from "@/lib/mcp/store";
import { isMcpTool, parseMcpToolName } from "@/lib/mcp/client";
import { MCP_PRESETS } from "@/lib/mcp/types";
import { loadSkillTool } from "@/lib/tools/skill-tools";

describe("MCP Store", () => {
  beforeEach(() => clearMcpServers());

  it("adds and retrieves servers", () => {
    addMcpServer({ name: "Gmail", url: "https://gmail.mcp.example.com", authType: "bearer" });
    const servers = getMcpServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe("Gmail");
    expect(servers[0].connected).toBe(false);
  });

  it("connects and disconnects servers", () => {
    const server = addMcpServer({ name: "Test", url: "https://test.com/mcp", authType: "bearer" });
    connectServer(server.id, "tok_123");
    let servers = getMcpServers();
    expect(servers[0].connected).toBe(true);
    expect(servers[0].token).toBe("tok_123");

    disconnectServer(server.id);
    servers = getMcpServers();
    expect(servers[0].connected).toBe(false);
    expect(servers[0].token).toBeUndefined();
  });

  it("getConnectedServers filters correctly", () => {
    const s1 = addMcpServer({ name: "A", url: "https://a.com", authType: "none" });
    addMcpServer({ name: "B", url: "https://b.com", authType: "none" });
    connectServer(s1.id);
    const connected = getConnectedServers();
    expect(connected).toHaveLength(1);
    expect(connected[0].name).toBe("A");
  });

  it("removes servers", () => {
    const server = addMcpServer({ name: "Remove Me", url: "https://x.com", authType: "none" });
    expect(getMcpServers()).toHaveLength(1);
    removeMcpServer(server.id);
    expect(getMcpServers()).toHaveLength(0);
  });
});

describe("MCP Client Utilities", () => {
  it("isMcpTool detects MCP tool names", () => {
    expect(isMcpTool("mcp__gmail__search_emails")).toBe(true);
    expect(isMcpTool("mcp__slack__post_message")).toBe(true);
    expect(isMcpTool("inference")).toBe(false);
    expect(isMcpTool("create_media")).toBe(false);
    expect(isMcpTool("canvas_get")).toBe(false);
  });

  it("parseMcpToolName extracts server ID and tool name", () => {
    const result = parseMcpToolName("mcp__gmail__search_emails");
    expect(result).toEqual({ serverId: "gmail", originalName: "search_emails" });
  });

  it("parseMcpToolName handles IDs with underscores", () => {
    const result = parseMcpToolName("mcp__mcp_1234_abc__list_tools");
    expect(result).toEqual({ serverId: "mcp_1234_abc", originalName: "list_tools" });
  });

  it("parseMcpToolName returns null for non-MCP tools", () => {
    expect(parseMcpToolName("inference")).toBeNull();
    expect(parseMcpToolName("mcp__")).toBeNull();
  });
});

describe("MCP Presets", () => {
  it("has 4 pre-configured servers", () => {
    expect(MCP_PRESETS).toHaveLength(4);
  });

  it("presets have required fields", () => {
    for (const preset of MCP_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.url).toBeTruthy();
      expect(preset.authType).toMatch(/^(bearer|oauth)$/);
    }
  });

  it("includes Gmail and Slack", () => {
    const ids = MCP_PRESETS.map((p) => p.id);
    expect(ids).toContain("gmail");
    expect(ids).toContain("slack");
  });
});

describe("Skill Registry — Phase 7", () => {
  it("includes daily-briefing skill", () => {
    const enums = loadSkillTool.parameters.properties?.skill_id?.enum as string[];
    expect(enums).toContain("daily-briefing");
  });

  it("has 11 total skills", () => {
    const enums = loadSkillTool.parameters.properties?.skill_id?.enum as string[];
    expect(enums).toHaveLength(11);
  });
});
