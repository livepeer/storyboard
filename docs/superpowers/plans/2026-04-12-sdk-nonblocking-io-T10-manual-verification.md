# T10 — Manual Frontend End-to-End Verification

> **Why manual:** T1–T9 cover every SDK invariant the design depends on (event loop freedom, per-stream lock correctness, ContextVar propagation, threadpool capacity, lifecycle cleanup). T10's value is verifying the user-visible experience in a real browser against the deployed frontend. Automating that via Playwright would require injecting API keys into localStorage, scripting the agent tool-call flow, parsing async responses, and handling unrelated frontend brittleness — significant maintenance debt for one observation. A manual run takes ~3 minutes and produces a clearer signal.

> **When to run:** before merging the `feat/sdk-nonblocking-io` branch on `livepeer/simple-infra`, and after every SDK image rebuild.

## Prerequisites

- The hot-patched `sdk-staging-1` is running the `feat/sdk-nonblocking-io` branch (or the rebuilt image).
- A Daydream API key with balance is configured in the storyboard frontend (paste it in via the settings UI on first load).
- A modern Chromium-based browser. Firefox/Safari should work too but Chromium is what staging users are on.

## Procedure

### Step 1: Open three browser tabs/windows

Open `https://your-storyboard-deployment` (or `http://localhost:3000` if testing against a local dev server) in three side-by-side browser windows. Confirm all three load the canvas successfully and show the chat input.

### Step 2: Start an LV2V stream in window 1

In window 1's chat input, type:
```
start an lv2v stream with a soft watercolor style
```
Press Enter. Wait until:
- A `stream` card appears on the canvas
- The card title shows `lv2v-stream` or similar
- The card's `pub:` and `recv:` counters start incrementing (visible in the bottom corner of the card)
- After ~30–60s of fal cold-start, real frames begin appearing in the card's image area

### Step 3: Start a second LV2V stream in window 2

In window 2's chat input, type:
```
start an lv2v stream with bold neon cyberpunk style
```
Press Enter. Confirm a second `stream` card appears in window 2's canvas and goes through the same `pub:`/`recv:` increment + frame display sequence as window 1.

**Critical observation:** window 1's stream must continue streaming *throughout* this. If window 1's card freezes or shows an error when window 2's stream starts, that means cross-stream isolation broke somewhere.

### Step 4: Fire an `ltx-i2v` inference in window 3

In window 3's chat input, type something like:
```
animate this prompt with ltx: a calico cat walking through a sunlit garden
```
Press Enter. The agent will go through `create_media` → BYOC → fal. Wait up to 90 seconds for the resulting video to appear on window 3's canvas as a `video` card.

**Critical observations during the 90-second wait:**
- **Window 1's LV2V stream must stay alive** — the card must not turn black, the `recv:` counter must keep incrementing, no error overlay
- **Window 2's LV2V stream must stay alive** — same criteria
- The `pub:` counters in both LV2V cards must keep growing at ~10 Hz

This is the original incident scenario. Pre-fix, the LV2V streams would die within seconds of the inference starting (the SDK's event loop got blocked, then the previous container restart loop killed in-flight `/stream/start` POSTs). With the fix, both streams stay alive.

### Step 5: Cleanup

Stop both LV2V streams via the stream card's stop button (or close the tabs — the in-tab `beforeunload` handler stops them). Confirm no orphan streams remain by hitting:

```bash
curl -s https://sdk.daydream.monster/streams 2>/dev/null
```

(If that endpoint exists in this SDK version. Older versions don't have it.)

Or wait 3 minutes for the LV2V stream reaper to kill any orphans.

## Pass criteria

| Observation | Pass |
|---|---|
| Both LV2V streams started without errors | ✅ |
| Both LV2V cards showed live frames (after ~30–60s cold-start each) | ✅ |
| `ltx-i2v` inference completed and produced a video card | ✅ |
| **Both LV2V streams stayed alive during the entire ltx-i2v inference** | ✅ |
| Browser console shows no red errors related to stream/inference flows | ✅ |
| No SDK 503 or 410 responses appear in the network tab | ✅ |

If all six are checked, T10 passes and the SDK non-blocking I/O design is confirmed end-to-end.

## Failure triage

| Symptom | Likely cause |
|---|---|
| LV2V card turns black during `ltx-i2v` | Event loop is blocked — check SDK uvicorn worker count and verify the Phase B+C wraps are deployed (`docker exec sdk-service grep 'asyncio.to_thread' /app/app.py | wc -l`) |
| LV2V card shows 410 error mid-stream | Per-stream lock cleanup ran prematurely or the reaper triggered too aggressively — check `_REAPER_IDLE_THRESHOLD_SEC` |
| `ltx-i2v` returns 503 with signer error | ContextVar propagation broken — check that `/inference` uses `asyncio.to_thread` not `loop.run_in_executor` |
| Both LV2V streams freeze when third one starts | Per-stream lock is global instead of per-stream — check `_publish_locks` is keyed by `stream_id` |
| `ltx-i2v` never returns | Threadpool may be saturated — check 64-thread default executor is configured at startup |

Each row corresponds to one of T1-T9 catching the same regression at a different layer. If T1-T9 all pass but T10 fails, the issue is in the frontend or in network-layer behavior, not in the SDK design.
