import { useCanvasStore } from "@/lib/canvas/store";
import { useLayoutStore } from "./store";
import { organizeCanvas } from "./agent";
import type { LayoutPreset } from "./types";
import { BASE_CARD_W } from "./types";

/** Aliases so the CLAUDE.md-documented commands (grid, flow) actually work.
 *  Keep in sync with the skill IDs in lib/layout/skills.ts. */
const ORGANIZE_ALIASES: Record<string, string> = {
  grid: "basic",
  flow: "pipeline",
  pathway: "pipeline",
  pipe: "pipeline",
  evolution: "pipeline",
  story: "narrative",
  sequence: "narrative",
  comic: "graphic-novel",
  novel: "graphic-novel",
  storyboard: "movie-board",
  film: "movie-board",
  cinema: "movie-board",
  moodboard: "ads-board",
  ads: "ads-board",
  brainstorm: "ads-board",
  even: "balanced",
  manual: "freeform",
  none: "freeform",
};

export function handleOrganize(args: string): string {
  const store = useCanvasStore.getState();
  if (store.cards.length === 0) return "Canvas is empty \u2014 nothing to organize.";

  const raw = args.trim().toLowerCase();
  const layoutStore = useLayoutStore.getState();
  // Resolve aliases first, then check that the resulting ID is valid.
  // If the user typed something we don't recognize AT ALL, return an
  // error instead of silently falling back to basic — they deserve
  // feedback that the name was wrong.
  let skillId: string | undefined;
  if (raw) {
    skillId = ORGANIZE_ALIASES[raw] || raw;
    if (!layoutStore.getSkill(skillId)) {
      const names = layoutStore.getAllSkills().map((s) => s.id).join(", ");
      const aliases = Object.entries(ORGANIZE_ALIASES)
        .map(([a, t]) => `${a}\u2192${t}`)
        .join(", ");
      return (
        `Unknown layout "${raw}".\n` +
        `Available: ${names}.\n` +
        `Aliases: ${aliases}.`
      );
    }
  }

  const positions = organizeCanvas(skillId);
  store.applyLayout(positions);

  const skill = skillId ? layoutStore.getSkill(skillId) : null;
  const name = skill?.name || "auto-selected";
  const aliasNote = raw && skillId !== raw ? ` (alias for ${skillId})` : "";

  return `Organized ${store.cards.length} cards using ${name}${aliasNote}.\nTip: /layout list \u2014 see all layout options`;
}

export function handleLayoutCommand(args: string): string {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0]?.toLowerCase();
  const rest = parts.slice(1).join(" ").trim();

  switch (sub) {
    case "list": return layoutList();
    case "add": return layoutAdd(rest);
    case "capture": return layoutCapture(rest);
    case "delete": return layoutDelete(rest);
    default:
      return "Usage: /layout list | /layout add <name> | /layout capture <name> | /layout delete <name>";
  }
}

function layoutList(): string {
  const store = useLayoutStore.getState();
  const all = store.getAllSkills();
  const builtIn = all.filter((s) => s.category === "built-in");
  const user = all.filter((s) => s.category === "user");

  const lines = ["Layout Skills:"];
  for (const s of builtIn) {
    const active = store.activeSkillId === s.id ? " (active)" : "";
    lines.push(`  \u25CF ${s.id.padEnd(16)} ${s.name} \u2014 ${s.description}${active}`);
  }
  if (user.length > 0) {
    lines.push("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    for (const s of user) {
      const active = store.activeSkillId === s.id ? " (active)" : "";
      lines.push(`  \u2605 ${s.id.padEnd(16)} ${s.name} \u2014 ${s.description}${active}`);
    }
  }
  lines.push("");
  lines.push("  Use: /organize <name>");
  return lines.join("\n");
}

function layoutAdd(name: string): string {
  if (!name) return "Usage: /layout add <name>\nExample: /layout add my-comic-layout";
  const id = `user_${name.toLowerCase().replace(/\s+/g, "-")}`;
  const preset: LayoutPreset = {
    cols: 4, gap: 24, cardScale: 1.0, flow: "ltr",
    groupBy: "batch", rowSeparator: 24, startCorner: "top-left",
  };
  useLayoutStore.getState().addUserSkill({
    id, name, description: "Custom layout", category: "user", preset,
  });
  return `Created layout skill "${name}" with default grid preset.\nCustomize by arranging cards, then /layout capture ${name}`;
}

function layoutCapture(name: string): string {
  if (!name) return "Usage: /layout capture <name>\nCaptures current card positions as a reusable layout.";
  const cards = useCanvasStore.getState().cards;
  if (cards.length === 0) return "Canvas is empty \u2014 nothing to capture.";

  // Infer columns
  const uniqueXs = new Set<number>();
  for (const c of cards) {
    let found = false;
    for (const ux of uniqueXs) { if (Math.abs(c.x - ux) < BASE_CARD_W * 0.5) { found = true; break; } }
    if (!found) uniqueXs.add(c.x);
  }
  const cols = Math.max(1, uniqueXs.size);

  // Infer gap
  const xs = cards.map((c) => c.x).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < xs.length; i++) {
    const diff = xs[i] - xs[i - 1];
    if (diff > 0 && diff < BASE_CARD_W * 2) gaps.push(diff - cards[0].w);
  }
  const gap = gaps.length > 0 ? Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]) : 24;
  const scale = cards[0].w / BASE_CARD_W;

  const preset: LayoutPreset = {
    cols, gap: Math.max(4, gap), cardScale: Math.round(scale * 10) / 10,
    flow: "ltr", groupBy: "batch", rowSeparator: 24, startCorner: "top-left",
  };
  const rawPositions = cards.map((c) => ({ cardId: c.id, x: c.x, y: c.y }));
  const skill = useLayoutStore.getState().captureLayout(name, preset, rawPositions);
  return `Captured "${name}" from ${cards.length} cards (${cols} cols, ${gap}px gap, ${scale.toFixed(1)}x scale).\nUse: /organize ${skill.id}`;
}

function layoutDelete(name: string): string {
  if (!name) return "Usage: /layout delete <name>";
  const store = useLayoutStore.getState();
  const skill = store.userSkills.find(
    (s) => s.id === name || s.name.toLowerCase() === name.toLowerCase()
  );
  if (!skill) return `Layout skill "${name}" not found. Use /layout list to see all.`;
  store.removeUserSkill(skill.id);
  return `Deleted layout skill "${skill.name}".`;
}
