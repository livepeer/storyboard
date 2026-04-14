/**
 * Ollama provider — local LLM via the OpenAI-compatible API.
 *
 * Subclasses OpenAIProvider with:
 *   - Default endpoint: http://localhost:11434/v1/chat/completions
 *   - Default models: llama3.1 family
 *
 * [INV-9]: this file is the ONLY place ollama-specific code lives.
 */

import { OpenAIProvider, type OpenAIConfig } from "./openai.js";
import type { Tier } from "../types.js";

export interface OllamaConfig extends Omit<OpenAIConfig, "apiKey"> {
  /** Optional API key (Ollama doesn't require one; defaults to "ollama"). */
  apiKey?: string;
}

const OLLAMA_DEFAULT_ENDPOINT = "http://localhost:11434/v1/chat/completions";

const OLLAMA_DEFAULT_MODELS: Record<Tier, string> = {
  0: "llama3.1:8b",
  1: "llama3.1:8b",
  2: "llama3.1:70b",
  3: "llama3.1:70b",
};

export class OllamaProvider extends OpenAIProvider {
  override readonly name = "ollama";

  constructor(config: OllamaConfig = {}) {
    super({
      apiKey: config.apiKey ?? "ollama",
      endpoint: config.endpoint ?? OLLAMA_DEFAULT_ENDPOINT,
      models: config.models,
    });
    // Override defaultModels to use llama3.1 family
    (this as any).defaultModels = OLLAMA_DEFAULT_MODELS;
  }
}
