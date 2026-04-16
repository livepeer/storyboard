import { describe, it, expect } from "vitest";
import { classifyIntent } from "../../src/agent/intent.js";

describe("classifyIntent", () => {
  it("classifies 'continue' as continue intent", () => {
    expect(classifyIntent("continue", true, 5).type).toBe("continue");
  });

  it("classifies '8 more scenes' as add_scenes with count 8", () => {
    const i = classifyIntent("give me 8 more scenes", true, 0);
    expect(i.type).toBe("add_scenes");
    if (i.type === "add_scenes") expect(i.count).toBe(8);
  });

  it("classifies 'where are my pictures' as status", () => {
    expect(classifyIntent("where are my pictures", true, 0).type).toBe("status");
  });

  it("returns 'none' for plain creative requests", () => {
    expect(classifyIntent("a red apple on a white table", false, 0).type).toBe("none");
  });

  it("ignores follow-up intents when no project is active", () => {
    expect(classifyIntent("continue", false, 0).type).toBe("continue");
  });
});
