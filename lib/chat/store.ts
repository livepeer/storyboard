import { create } from "zustand";

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
  setProcessing: (v: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [
    {
      id: "0",
      role: "system",
      text: "Connected — describe what you want to create",
      timestamp: Date.now(),
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

  setProcessing: (v) => set({ isProcessing: v }),

  clearMessages: () =>
    set({
      messages: [
        {
          id: String(++nextMsgId),
          role: "system",
          text: "Cleared — describe what you want to create",
          timestamp: Date.now(),
        },
      ],
    }),
}));
