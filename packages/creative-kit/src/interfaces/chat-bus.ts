/**
 * ChatBus — minimal message protocol for agent/user/system communication.
 */

export type MessageRole = "user" | "agent" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: number;
}

export interface ChatBus {
  messages: ChatMessage[];
  isProcessing: boolean;

  addMessage(text: string, role: MessageRole): ChatMessage;
  setProcessing(v: boolean): void;
  clearMessages(): void;
}
