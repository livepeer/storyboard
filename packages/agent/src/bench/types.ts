export interface BenchTask {
  id: string;
  description: string;
  input: string;
  expectedTools?: string[];
  maxTokens: number;
  category: "single-image" | "multi-scene" | "edit" | "stream" | "memory" | "skill";
}

export interface BenchResult {
  taskId: string;
  ok: boolean;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  durationMs: number;
  toolCalls: number;
  error?: string;
}

export interface BenchReport {
  ts: string;
  commit: string;
  results: BenchResult[];
  totals: { tokens: number; ms: number; ok: number; failed: number };
  baseline?: { tokens: number; deltaPct: number };
}
