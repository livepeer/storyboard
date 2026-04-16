# Token Economics Analysis: 6-Scene Story Generation

> How many LLM tokens does Storyboard consume for a 6-scene storyboard vs. alternative workflows?

## TL;DR

| Path | LLM tokens | Round trips | User typing | Time | Style consistency |
|---|---:|---:|:---|:---|:---|
| **`/story` (Storyboard)** | **~1,400** | **1** | 10 words | **10–15 s** | automatic |
| Storyboard pre-`/story` | ~12,700 | 3 | 40-60 words | 25–40 s | automatic (if it succeeds) |
| ChatGPT + fal.ai | ~2,050 | 2-3 | 200+ words | 15–25 min | manual drift |
| fal.ai only (no LLM) | 0 | 0 | 500+ words | 20–40 min | manual drift |

**`/story` achieves ~90% LLM token reduction** vs. the previous storyboard chat path, **~30% vs. ChatGPT + fal.ai**, and **60-100× faster** end-to-end than any tool-switching workflow.

---

## Path A — Storyboard `/story` + natural-language apply

```
User types:  "/story a cat and dog friendship for 10 year olds"   (~12 tokens)

1. /story generator → /api/agent/gemini   (ONE call, no tools)
   ├── system prompt (storyteller):  ~800 input tokens
   ├── user text:                     ~12 input tokens
   ├── tool schemas:                    0 tokens  ← no tools sent
   └── JSON response (6 scenes):    ~600 output tokens
                                                      = ~1,412 tokens

2. User types "apply them" → natural-language apply (regex, zero-token)
   ├── LLM tokens:                      0
   ├── sets CreativeContext
   ├── sets ActiveRequest
   └── calls project_create + project_generate directly (fast path)

   TOTAL ≈ 1,412 tokens, 1 round trip, 10-15 seconds
```

### Why so few tokens

- **No tool schemas.** The storyteller call sends zero tool definitions. In the standard agent path, 19 registered tools consume ~1,800 input tokens per turn — just to describe what functions are available. `/story` bypasses this entirely.
- **No clarification turns.** The storyteller prompt is designed to produce complete output on the first call. No "shall I create 3 scenes?" back-and-forth.
- **Zero-token apply.** The "apply them" / "yes" / "I like it" detection is a client-side regex that routes to `project_create + project_generate` without any LLM call.

---

## Path B — Storyboard before `/story` (the baseline)

```
Turn 1: user types brief → full runStream via Gemini
   ├── system prompt (context-builder):  ~2,000 input
   ├── tool schemas (19 tools):          ~1,800 input
   ├── user text:                           ~60 input
   └── Gemini asks clarification:          ~100 output     = ~3,960

Turn 2: user answers "yes" → another full runStream
   ├── system prompt:                    ~2,000 input
   ├── tool schemas:                     ~1,800 input
   ├── user text:                            ~5 input
   └── Gemini calls project_create:       ~200 output      = ~4,005

Turn 3: project_generate runs → Gemini gets tool result → responds
   ├── system prompt:                    ~2,000 input
   ├── tool schemas:                     ~1,800 input
   ├── tool result (6 scenes):            ~800 input
   └── Gemini summary:                    ~150 output      = ~4,750

   TOTAL ≈ 12,715 tokens, 3 round trips, 25-40 seconds
```

### Where the overhead comes from

- **Tool schemas × 3 turns = ~5,400 tokens** — over 40% of the total. Sent every turn so Gemini knows what functions are available, even though only 2-3 are actually called.
- **System prompt × 3 turns = ~6,000 tokens** — the context-builder assembles intent context, project state, canvas cards, memory digest, and active request into a ~2k-token system prompt that's re-sent on every turn.
- The actual *work* (user text + model output) is < 1,500 tokens. The rest is protocol overhead.

---

## Path C — ChatGPT/Claude + fal.ai (tool-switching workflow)

```
Step 1: User switches to ChatGPT, asks for a story
   ├── user ask:            ~50 tokens
   └── LLM response:     ~1,200 tokens (prose, not structured)    = ~1,250

Step 2: User reads, reformats into 6 scene prompts manually
   ├── LLM tokens:            0 (cognitive work)
   └── time:                  5-8 minutes

Step 3: User opens fal.ai, pastes prompts one at a time
   ├── LLM tokens:            0 (pure image gen)
   └── time:                  1-2 min × 6 scenes = 6-12 min

Step 4: Style drift → user returns to ChatGPT for corrections
   ├── 1-2 more turns:      ~800 tokens
   └── time:                  2-5 min

Step 5: Download, save, rename, organize
   ├── LLM tokens:            0
   └── time:                  3-5 min

   TOTAL LLM ≈ 2,050 tokens, 15-25 minutes, 3 apps, manual consistency
```

---

## Path D — fal.ai only, no LLM

```
User writes 6 prompts from scratch:
   ├── LLM tokens:            0
   ├── time:                  20-40 min
   ├── cognitive load:        high (need style vocabulary)
   └── style consistency:     usually bad by scene 4
```

---

## Dollar cost comparison (Gemini 2.5 Flash pricing)

```
Gemini 2.5 Flash:  $0.075 / 1M input tokens
                   $0.30  / 1M output tokens
```

| Path | Input tokens | Output tokens | Cost per 6-scene story |
|---|---:|---:|---:|
| A — `/story` | 812 | 600 | **$0.00024** (~0.02¢) |
| B — pre-`/story` | 12,265 | 450 | **$0.00105** (~0.11¢) |
| C — ChatGPT + fal.ai | 1,250 | 800 | ~$0.00033 (~0.03¢) |
| D — fal.ai only | 0 | 0 | $0 (LLM) |

On 1,000 stories: **$0.24 vs $1.05** (Path A vs B). Modest in absolute terms — the bigger wins are time, UX, and consistency.

---

## The savings that matter more than tokens

1. **Round trips: 1 vs. 3.** Each extra round trip is 3-8 seconds of user-perceived latency. On a slow network, round-trip count dominates time-to-first-result.

2. **Zero tool-schema overhead.** `/story` sends no tools at all. Path B spends ~5,400 of its ~12,700 tokens just describing tools Gemini might theoretically call.

3. **Zero apply-path LLM tokens.** "Apply them" → client-side regex → `project_create + project_generate` directly. No Gemini call. In Path B, "yes" burns ~4,000 more tokens.

4. **Time-to-canvas: 10-15 s vs. 15-25 min.** For Path C (the workflow most users actually take today), this is the killer argument. Users don't leave the app. Iteration loops that took tens of minutes take seconds.

5. **User typing: 10 words vs. 200+ words.** The cognitive cost of "writing six good scene prompts with consistent style" is enormous for non-writers. `/story` lets a 10-year-old with an idea become the director of their storyboard without knowing any prompt craft.

6. **Style consistency is free.** Paths C and D suffer from drift — by scene 5 the user forgot to include "Studio Ghibli watercolor" and got photorealistic output. Path A sets `CreativeContext` once from the story's context block and every scene inherits the style forever.

---

## What the console shows

After `/story a cat and dog friendship for 10 year olds`:

```
Done in 12.3s — storyteller: 6 scenes planned
  — 1,412 tokens (812 in / 600 out)
  Project "Cat and Dog Who Found Each Other" — 1,412 tokens across 1 turn
```

After "apply them":

```
✓ Applied "Cat and Dog Who Found Each Other" — 6 scenes generating now.
  — 0 tokens (0 in / 0 out)     ← apply is zero-token
```

---

## Bottom line

- vs. pre-`/story` storyboard path: **~90% LLM token reduction**, **3× fewer round trips**, **2-3× faster**.
- vs. ChatGPT + fal.ai: **~30% token reduction**, but **60-100× faster** end-to-end, **1 tool instead of 3**, and style consistency that was previously impossible without manual work.
- vs. raw fal.ai: no LLM tokens either way, but time/cognitive cost drops from 20-40 min to 10-15 s.

The strongest argument isn't the raw token count — it's that **a user with zero prompt-craft skill can produce consistent 6-scene storyboards in 15 seconds from 10 words of intent**, and every alternative costs them either more tokens, more time, or both.
