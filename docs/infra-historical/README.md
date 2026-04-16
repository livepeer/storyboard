# Historical infra artifacts — imported from simple-infra 2026-04-14

These files originated in the `livepeer/simple-infra` repo as untracked work during the storyboard-a3 planning/prototype phase (March–April 2026). They predate this Next.js project and are preserved here as historical reference. **They have all been superseded by current storyboard-a3 work** and should not be treated as current design.

## Files

| File | Supersedes / Superseded by | Purpose at the time |
|---|---|---|
| `2026-04-05-initial-storyboard-a3-plan.md` | Superseded by `docs/plan/implementation.md`, `docs/plan/phase1.md`, `docs/plan/status.md` | 2077-line master plan for transforming the single-file storyboard prototype into a production agent tool. The "implementation plan with Context Preservation Protocol" scaffolding. |
| `2026-04-05-claude-as-agent-initial-design.md` | Superseded by `docs/storyboard-agent-arch.md`, `docs/agent-orchestration-design.md` | 452-line design exploring three architectures for Claude-as-agent-brain (browser-direct API, MCP, hybrid). Informed the current agent plugin design but the final architecture is different. |
| `2026-04-07-storyboard-prototype.html` | Superseded by the current Next.js `app/` + `components/` | Single-file HTML prototype (~4000 lines) that was the proof-of-concept for the storyboard tool. The hand-coded mega-prompt planner is here. |
| `2026-04-08-byoc-a3-staging-config.yaml` | N/A — A3 VMs decommissioned 2026-04 via simple-infra PR #8 | Original parallel "A3" BYOC + SDK staging VMs config. The A3 VMs (`sdk-a3-staging-1`, `byoc-a3-staging-1`, `orch-a3-staging-1`) were decommissioned because they were identical to the primary staging VMs. |
| `2026-04-10-signer-byoc-incident-writeup.md` | N/A — resolved | Incident writeup of the "BYOC HTTP 502 after signer redeploy" issue. Root cause: `livepeer/go-livepeer:ja-serverless` had removed `/sign-byoc-job`. Fix: `livepeer/go-livepeer#3899`, now running on both signers as `livepeer/go-livepeer:pr-3899` (simple-infra PR #10). |

## Why preserve instead of delete

Two reasons:
1. **Decision archaeology** — the plan and agent-design docs capture *why* certain architectural choices were made. Future contributors can trace back from "why is `storyboard-agent-arch.md` shaped this way" to "because the initial plan explored these three options and rejected X because of Y".
2. **Prototype reference** — the HTML prototype is the last working single-file version and can be compared against the Next.js rewrite to verify behavior parity.

## What NOT to do with these files

- Don't read them as current design. Read `docs/plan/implementation.md` and `docs/storyboard-agent-arch.md` instead.
- Don't restore the HTML prototype. It's a snapshot, not a living thing.
- Don't re-create A3 VMs based on `byoc-a3-staging-config.yaml`. The model IDs in it are stale (e.g. `fal-ai/bg-remove` → now `fal-ai/birefnet`); see the live `simple-infra/environments/staging/byoc.yaml` and `https://sdk.daydream.monster/capabilities` for current state.
