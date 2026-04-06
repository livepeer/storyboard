import { describe, it, expect, vi, beforeEach } from "vitest";
import { trackUsage, checkBudget, setDailyLimit, getBudgetState } from "@/lib/agents/claude/budget";

describe("Claude Budget", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
  });

  it("starts with zero usage", () => {
    const status = checkBudget();
    expect(status.used).toBe(0);
    expect(status.exceeded).toBe(false);
    expect(status.warning).toBe(false);
  });

  it("tracks token usage", () => {
    trackUsage(10000);
    trackUsage(5000);
    const status = checkBudget();
    expect(status.used).toBe(15000);
    expect(status.pct).toBe(30);
  });

  it("warns at 80% usage", () => {
    trackUsage(40000); // 80% of default 50000
    const status = checkBudget();
    expect(status.warning).toBe(true);
    expect(status.exceeded).toBe(false);
  });

  it("marks exceeded at 100%", () => {
    trackUsage(50000);
    const status = checkBudget();
    expect(status.exceeded).toBe(true);
  });

  it("allows setting custom daily limit", () => {
    setDailyLimit(100000);
    trackUsage(50000);
    const status = checkBudget();
    expect(status.pct).toBe(50);
    expect(status.exceeded).toBe(false);
    expect(status.limit).toBe(100000);
  });

  it("returns budget state", () => {
    trackUsage(1234);
    const state = getBudgetState();
    expect(state.daily_tokens_used).toBe(1234);
    expect(state.daily_limit).toBe(50000);
    expect(state.last_reset).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
