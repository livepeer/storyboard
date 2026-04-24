export interface VariationOptions {
  sourceRefId: string;
  sourceUrl: string;
  prompt: string;
  capability: string;
  count?: number;
  strategy: "seed" | "model" | "prompt" | "mixed";
}

export interface VariationStep {
  action: "restyle";
  prompt: string;
  source_url: string;
  seed?: number;
  capability_hint?: string;
}

const PROMPT_PREFIXES = [
  "alternative composition, ",
  "different angle, ",
  "closer view, ",
  "wider shot, ",
  "dramatic lighting, ",
  "softer tones, ",
];

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

function pickPrefix(index: number): string {
  return PROMPT_PREFIXES[index % PROMPT_PREFIXES.length];
}

export function buildVariationSteps(opts: VariationOptions): VariationStep[] {
  const count = opts.count ?? 4;
  const steps: VariationStep[] = [];

  for (let i = 0; i < count; i++) {
    switch (opts.strategy) {
      case "seed":
        steps.push({
          action: "restyle",
          prompt: opts.prompt,
          source_url: opts.sourceUrl,
          seed: randomSeed(),
        });
        break;

      case "model":
        steps.push({
          action: "restyle",
          prompt: opts.prompt,
          source_url: opts.sourceUrl,
          seed: randomSeed(),
          ...(i % 2 === 1 ? { capability_hint: "kontext-edit" } : {}),
        });
        break;

      case "prompt":
        steps.push({
          action: "restyle",
          prompt: pickPrefix(i) + opts.prompt,
          source_url: opts.sourceUrl,
          seed: randomSeed(),
        });
        break;

      case "mixed":
      default:
        if (i === 0) {
          // Same model, random seed
          steps.push({
            action: "restyle",
            prompt: opts.prompt,
            source_url: opts.sourceUrl,
            seed: randomSeed(),
          });
        } else if (i === 1) {
          // kontext-edit hint, random seed
          steps.push({
            action: "restyle",
            prompt: opts.prompt,
            source_url: opts.sourceUrl,
            seed: randomSeed(),
            capability_hint: "kontext-edit",
          });
        } else {
          // Prompt tweaks
          steps.push({
            action: "restyle",
            prompt: pickPrefix(i - 2) + opts.prompt,
            source_url: opts.sourceUrl,
            seed: randomSeed(),
          });
        }
        break;
    }
  }

  return steps;
}
