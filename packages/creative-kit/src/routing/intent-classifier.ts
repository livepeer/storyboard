export interface IntentContext {
  hasActiveProject: boolean;
  pendingItems: number;
}

export interface IntentRule {
  type: string;
  test: (text: string, context: IntentContext) => boolean;
  priority?: number;
}

export interface IntentClassifier {
  register(rule: IntentRule): void;
  classify(text: string, context: IntentContext): { type: string };
}

export function createIntentClassifier(
  initialRules?: IntentRule[]
): IntentClassifier {
  const rules: IntentRule[] = initialRules ? [...initialRules] : [];

  function register(rule: IntentRule): void {
    rules.push(rule);
  }

  function classify(
    text: string,
    context: IntentContext
  ): { type: string } {
    // Sort by priority descending (higher priority = checked first)
    const sorted = [...rules].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    );

    for (const rule of sorted) {
      if (rule.test(text, context)) {
        return { type: rule.type };
      }
    }

    return { type: "none" };
  }

  return { register, classify };
}
