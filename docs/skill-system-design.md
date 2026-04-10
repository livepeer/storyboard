# Skill System Design

## Overview

Skills are markdown files that modify agent behavior. They can be loaded/unloaded via `/commands` in chat, organized by category, and created by users during sessions.

## Commands

| Command | Action |
|---------|--------|
| `/skills` | List all available skills with categories |
| `/skills/load xxx` | Load skill into active context |
| `/skills/unload xxx` | Remove skill from active context |
| `/skills/clear` | Unload all except base.md |
| `/skills/load-by-category xxx` | Load all skills in a category |
| `/skills/create xxx for yyy` | Create a new user skill |
| `/capabilities` | List available models |
| `/export` | Export canvas to JSON |

## Skill Categories

| Category | Purpose |
|----------|---------|
| core | Always-loaded (base.md) |
| creation | Media creation guidance |
| workflow | Multi-step workflows |
| live | Live streaming |
| style | Style override packs — inject prompt prefix/suffix |
| integration | External services |
| user | User-created skills |

## Style Override Skills

When a style skill is loaded, its `prompt_prefix` and `prompt_suffix` are injected into every `create_media` prompt automatically. The agent is told not to duplicate the style keywords.

Only one style skill active at a time (loading a new one auto-unloads the previous).

## Architecture

- `lib/skills/store.ts` — Zustand store (registry, loaded set, cache)
- `lib/skills/commands.ts` — /command parser + executor
- `lib/skills/types.ts` — SkillMeta type
- `public/skills/_registry.json` — manifest of all built-in skills
- `public/skills/styles/` — style pack files

Style injection happens in `compound-tools.ts` before `runInference`.
System prompt includes loaded skill content.
User skills stored in localStorage.
