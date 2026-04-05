import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "@/lib/chat/store";

function resetStore() {
  useChatStore.setState({
    messages: [
      { id: "0", role: "system", text: "Connected", timestamp: Date.now() },
    ],
    isProcessing: false,
  });
}

describe("Chat Store", () => {
  beforeEach(() => resetStore());

  it("starts with a system message", () => {
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().messages[0].role).toBe("system");
  });

  it("adds messages with correct role", () => {
    useChatStore.getState().addMessage("Hello", "user");
    useChatStore.getState().addMessage("Hi there", "agent");

    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(3);
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].text).toBe("Hello");
    expect(msgs[2].role).toBe("agent");
  });

  it("returns the created message", () => {
    const msg = useChatStore.getState().addMessage("Test", "user");
    expect(msg.text).toBe("Test");
    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it("sets processing state", () => {
    useChatStore.getState().setProcessing(true);
    expect(useChatStore.getState().isProcessing).toBe(true);

    useChatStore.getState().setProcessing(false);
    expect(useChatStore.getState().isProcessing).toBe(false);
  });

  it("clears messages with a fresh system message", () => {
    useChatStore.getState().addMessage("Msg 1", "user");
    useChatStore.getState().addMessage("Msg 2", "agent");
    useChatStore.getState().clearMessages();

    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].text).toContain("Cleared");
  });
});
