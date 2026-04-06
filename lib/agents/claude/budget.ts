const STORAGE_KEY = "storyboard_claude_budget";
const DEFAULT_DAILY_LIMIT = 50_000; // tokens
const WARNING_THRESHOLD = 0.8;

interface BudgetState {
  daily_tokens_used: number;
  daily_limit: number;
  last_reset: string; // ISO date (YYYY-MM-DD)
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function load(): BudgetState {
  if (typeof window === "undefined") {
    return { daily_tokens_used: 0, daily_limit: DEFAULT_DAILY_LIMIT, last_reset: today() };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = JSON.parse(raw) as BudgetState;
      // Reset if new day
      if (state.last_reset !== today()) {
        state.daily_tokens_used = 0;
        state.last_reset = today();
        save(state);
      }
      return state;
    }
  } catch {
    // Ignore parse errors
  }
  return { daily_tokens_used: 0, daily_limit: DEFAULT_DAILY_LIMIT, last_reset: today() };
}

function save(state: BudgetState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function trackUsage(tokens: number) {
  const state = load();
  state.daily_tokens_used += tokens;
  save(state);
}

export function checkBudget(): {
  exceeded: boolean;
  warning: boolean;
  pct: number;
  used: number;
  limit: number;
} {
  const state = load();
  const pct = Math.round((state.daily_tokens_used / state.daily_limit) * 100);
  return {
    exceeded: state.daily_tokens_used >= state.daily_limit,
    warning: state.daily_tokens_used >= state.daily_limit * WARNING_THRESHOLD,
    pct,
    used: state.daily_tokens_used,
    limit: state.daily_limit,
  };
}

export function getBudgetState(): BudgetState {
  return load();
}

export function setDailyLimit(limit: number) {
  const state = load();
  state.daily_limit = limit;
  save(state);
}
