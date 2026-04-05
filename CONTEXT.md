# Context for New Claude Session — Storyboard A3

## How to Start

Open a new Claude Code session in the storyboard-a3 directory:

```bash
cd /Users/qiang.han/Documents/mycodespace/storyboard-a3
claude
```

Then paste this as your first message:

---

**START HERE — paste everything below into the new session:**

I'm building a Next.js app called Storyboard A3 — an agent-powered creative tool for Livepeer. The full plan, architecture, and CLAUDE.md are already in this repo. Read these files to get context:

1. Read `CLAUDE.md` — project overview, architecture decisions, infrastructure rules
2. Read `docs/plan/status.md` — what's done and what's next
3. Read `docs/plan/implementation.md` lines 1-70 — vision and Phase 0 structure

Then start executing Phase 0. The first task is:

**Phase 0.4: Scaffold Next.js app + CI/CD**

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir=false --import-alias="@/*"
npm install zustand
npm install -D playwright @playwright/test vitest
```

Then configure `vercel.json` and `tailwind.config.ts`.

IMPORTANT RULES:
- DO NOT TOUCH anything in `/Users/qiang.han/Documents/mycodespace/simple-infra` deployment (existing VMs, existing SDK). Read from it for reference only.
- The storyboard.html to migrate lives at `/Users/qiang.han/Documents/mycodespace/simple-infra/storyboard.html`
- After each milestone, commit with a descriptive message and update `docs/plan/status.md`
- Read `docs/plan/implementation.md` for detailed specs before implementing each milestone

---

## What the New Session Needs to Know

### This session accomplished:
1. Fixed LV2V streaming end-to-end (payment loops, prompt delivery, pipeline loading)
2. Added webcam + video LV2V features to storyboard.html
3. Designed the full agent architecture (Claude as in-browser chat agent with tool-use)
4. Designed token optimization (5 levels, 51x reduction, SDK smart tools)
5. Designed plugin system (BuiltIn, Claude, OpenAI — shared tool registry)
6. Created the full implementation plan (8 phases, 9 weeks, 2038 lines)
7. Created the project directory structure at storyboard-a3/
8. Defined infrastructure isolation (new VMs, don't touch existing)
9. Defined Vercel deployment (Livepeer Foundation org, qiang@livepeer.org)
10. Scored and reviewed the plan (78→96/100), filled all critical gaps

### The new session does NOT need to:
- Understand the LV2V protocol details (that's in simple-infra's CLAUDE.md)
- Re-analyze the Scope codebase (findings are embedded in skills/)
- Re-design the architecture (it's in docs/design/architecture.md)
- Re-debate Claude vs OpenAI vs fork (decided: Claude API in browser, plugin system)

### The new session DOES need to:
- Read CLAUDE.md and the first 70 lines of implementation.md for orientation
- Start executing Phase 0.4 (scaffold) → 0.5a (canvas) → 0.5b (chat) → 0.5c (agent) → 0.5d (camera)
- Reference storyboard.html for the code to migrate
- Follow the context save protocol (commit + update status.md after each milestone)
