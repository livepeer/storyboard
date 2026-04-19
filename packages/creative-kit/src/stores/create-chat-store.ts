import { createStore } from "zustand/vanilla";
import type { ChatBus, ChatMessage, MessageRole } from "../interfaces/chat-bus";

let _msgCounter = 0;

export function createChatStore() {
  return createStore<ChatBus>()((set) => ({
    messages: [],
    isProcessing: false,

    addMessage(text: string, role: MessageRole): ChatMessage {
      const msg: ChatMessage = {
        id: String(++_msgCounter),
        role,
        text,
        timestamp: Date.now(),
      };
      set((s) => ({ messages: [...s.messages, msg] }));
      return msg;
    },

    setProcessing(v: boolean): void {
      set({ isProcessing: v });
    },

    clearMessages(): void {
      set({ messages: [] });
    },
  }));
}
