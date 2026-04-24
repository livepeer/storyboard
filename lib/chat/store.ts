import { create } from "zustand";
import type { ChatBus } from "@livepeer/creative-kit";

export type MessageRole = "user" | "agent" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: number;
}

let nextMsgId = 0;

interface ChatState {
  messages: ChatMessage[];
  isProcessing: boolean;

  addMessage: (text: string, role: MessageRole) => ChatMessage;
  updateMessage: (id: string, text: string) => void;
  setProcessing: (v: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [
    {
      id: "0",
      role: "system",
      text: "Connected — describe what you want to create",
      timestamp: 0, // Static to avoid SSR hydration mismatch
    },
  ],
  isProcessing: false,

  addMessage: (text, role) => {
    const msg: ChatMessage = {
      id: String(++nextMsgId),
      role,
      text,
      timestamp: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, msg] }));
    return msg;
  },

  updateMessage: (id, text) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, text } : m)),
    })),

  setProcessing: (v) => set({ isProcessing: v }),

  clearMessages: () =>
    set({
      messages: [
        {
          id: String(++nextMsgId),
          role: "system",
          text: "Cleared — describe what you want to create",
          timestamp: 0,
        },
      ],
    }),
}));
