# SDK Non-Blocking I/O Design

**Status:** design approved, plan pending
**Target repo:** `livepeer/simple-infra` → `sdk-service-build/app.py`
**Branch:** `feat/sdk-nonblocking-io` (off `feat/sdk-capabilities-cache`)
**Date:** 2026-04-12

## Problem

The SDK service (`sdk.daydream.monster`) exposes `FastAPI` handlers that make synchronous HTTP calls (via the `livepeer_gateway` SDK, `urllib.request`, and helper functions) from inside `async def` handlers. Python's event loop cannot schedule other coroutines while a sync call is blocking the thread, so:

- A 30–60 s `ltx-i2v` render on `/inference` freezes every other handler on the process.
- A per-frame `/stream/{id}/publish` call that takes 50 ms blocks the loop 10× per second per active LV2V stream, starving every other endpoint.
- `/capabilities` and `/stream/start` arriving during an ongoing inference wait behind it, which is what previously caused the healthcheck cron to declare the SDK dead during video gen.

The crash-loop symptom was unblocked on 2026-04-12 by caching `/capabilities` in-process, disarming the cron killer, and reverting `--workers 4` (which broke LV2V because session state is per-process). What remains is the underlying architectural issue: **blocking I/O inside async handlers**. Until the handlers stop blocking the event loop, any latency improvement is fragile.

This spec is the proper fix.

## Non-goals

- Multi-worker uvicorn. Multi-worker is off the table until LV2V session state (`_stream_sessions`, `_lv2v_jobs`) is moved to a shared store — a separate, larger effort. Single-worker non-blocking is the target.
- Replacing `livepeer_gateway` or `urllib` with an async HTTP client. Pure threadpool offload preserves the existing call surface and minimizes regression risk.
- Changing any client-side behavior in `storyboard-a3`. The client already handles the existing semantics correctly (410 → terminal, seq-based publish ordering).
- Moving LV2V session state out of process. That's a separate, much larger change tracked elsewhere.

## Architecture

All blocking I/O sites get wrapped with `await asyncio.to_thread(fn, *args)`. The event loop stays free for new requests while sync work runs on a threadpool shared with FastAPI's existing sync-handler dispatch. The default executor is resized to 64 threads at startup to give comfortable headroom over the current worst-case workload (5 concurrent long inferences + 10 active LV2V streams with ~2 publishes in flight each).

Three special cases complicate the pure "wrap everything" pattern:

1. **`/stream/{id}/publish` has a frame-ordering constraint.** The go-livepeer trickle server (`trickle_server.go:82`) uses a 5-slot ring buffer per stream keyed by `idx % 5`. If seq N's write is still in flight when seq N+5 arrives, the newer segment evicts the older one — frame loss. Today's blocking behavior serializes publishes across all streams (accidentally safe); naive threadpool fan-out breaks this. Fix: a per-stream `asyncio.Lock` ensures at most one publish per stream is in flight at any moment, while still allowing full parallelism across streams.

2. **`ContextVar` propagation.** The handler at `/inference` (and other `submit_byoc_job` call sites) sets `_current_signer_headers` via ContextVar, which some helpers read transitively. `asyncio.to_thread` propagates ContextVars into the thread (via `contextvars.copy_context()`); `loop.run_in_executor` does not. All new wraps use `asyncio.to_thread`.

3. **Helper functions used by multiple handlers.** `_llm_call` (urllib to an LLM provider) and `_control_post` (urllib to an orchestrator control channel) are used from several handlers. Rather than wrapping every call site, they become `async def` that internally `await asyncio.to_thread` the sync urllib work. Call sites change from `foo(...)` to `await foo(...)` — mechanical and searchable.

## Tech Stack

- Python `asyncio.to_thread(fn, *args)` — Python 3.9+ standard library. Uses the default `ThreadPoolExecutor` and copies `contextvars.Context` into the worker thread automatically.
- `concurrent.futures.ThreadPoolExecutor(max_workers=64)` — installed as the event loop's default executor in a FastAPI `startup` handler.
- Per-stream `asyncio.Lock`s stored in a module-level dict, same lifecycle as `_stream_sessions` / `_lv2v_jobs`.
- No new third-party dependencies.

## Detailed Design

### 1. Threadpool sizing

At app startup:

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

@app.on_event("startup")
async def _install_default_executor():
    # Shared executor for every asyncio.to_thread call + FastAPI sync-handler
    # dispatch. 64 threads chosen to cover:
    #   - ~5 concurrent long inferences (ltx-i2v, 30-60s each)
    #   - ~10 active LV2V streams × up to 2 publishes in flight per stream
    #   - ambient /capabilities/control/status/health traffic
    # This is the only place the default executor is configured. Adjust here.
    loop = asyncio.get_running_loop()
    loop.set_default_executor(ThreadPoolExecutor(max_workers=64, thread_name_prefix="sdk"))
```

Reason 64: current worst-case realistic workload is ~30 threads busy; 34-thread margin absorbs bursts. At 1–10 concurrent users this is deliberate overkill and safe. Revisit only if traffic reality changes.

### 2. `/inference`, `/train`, `/enrich`, `/capabilities`-refresh — simple wrap

Every `submit_byoc_job`, `submit_training_job`, `get_training_status`, and `list_capabilities` call becomes `await asyncio.to_thread(...)`. Error handling (the `except NoOrchestratorAvailableError` / `except LivepeerGatewayError` blocks) stays outside the wrap and catches exceptions re-raised by `to_thread`. No other logic changes.

The `/capabilities` handler's cache layer (from `feat/sdk-capabilities-cache`) already guards the hot path — this change only affects the once-per-60s refresh and rare stale-on-error path. But wrapping it is necessary so cache misses don't block the loop.

### 3. `_llm_call`, `_control_post` — helpers become async

Current:
```python
def _llm_call(...) -> dict:
    req = urllib.request.Request(...)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())
```

New:
```python
async def _llm_call(...) -> dict:
    def _do():
        req = urllib.request.Request(...)
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    return await asyncio.to_thread(_do)
```

All call sites change from `_llm_call(...)` to `await _llm_call(...)`. A grep pass catches them all.

`_control_post` gets the same treatment. The existing LV2V `start_lv2v` wrap at line ~1225 (which uses `run_in_executor` + explicit header passing) is left alone — it already works and changing it for consistency risks regression.

### 4. `/stream/{id}/publish` — per-stream lock + thread wrap

The hottest path, 10 Hz per stream, 5-slot ring buffer constraint. Design:

```python
# Module-level, next to _stream_sessions
_publish_locks: dict[str, asyncio.Lock] = {}
```

**Lifecycle:**

- **Create** in `/stream/start` (line ~1241), immediately after `_lv2v_jobs[stream_id] = job`:
  ```python
  _publish_locks[stream_id] = asyncio.Lock()
  ```
  Eager creation: the lock always exists before the first publish lookup. Colocated with the session registration so the two can never drift apart.

- **Destroy** in `/stream/{id}/stop` (line ~1288), same block as `_stream_sessions.pop` / `_lv2v_jobs.pop`:
  ```python
  _publish_locks.pop(stream_id, None)
  ```
  Existing acquirers hold a reference to the `Lock` object, so popping the dict entry doesn't invalidate their hold. New publish requests will fail lookup and return 410, which the client handles as terminal.

- **Reaper cleanup:** the existing stream reaper (documented in CLAUDE.md, kills idle streams >2 min / age >1 hr) already pops `_stream_sessions` and `_lv2v_jobs`. One-line addition to pop `_publish_locks` at the same point.

- **Lookup failure:** `/stream/{id}/publish` returns **HTTP 410 Gone** if `stream_id not in _publish_locks`. Matches the existing "unknown stream → 410" semantics in the current publish handler. Client already handles this correctly (`lib/stream/session.ts:167` treats first 410 as terminal).

**Publish handler rewrite:**

```python
@app.post("/stream/{stream_id}/publish")
async def publish_frame(stream_id: str, request: Request, seq: int = 0):
    lock = _publish_locks.get(stream_id)
    if lock is None:
        raise HTTPException(status_code=410, detail="Stream no longer exists")

    # Existing trickle URL resolution logic stays identical...
    job = _lv2v_jobs.get(stream_id)
    if job is None:
        raise HTTPException(status_code=410, detail="Stream no longer exists")
    trickle_url = f"{job.publish_url}/{seq}"
    body = await request.body()

    def _do_publish():
        req = urllib.request.Request(trickle_url, data=body, method="POST")
        with urllib.request.urlopen(req, timeout=10, context=_ssl_ctx) as r:
            return r.status, dict(r.headers)

    async with lock:
        # Per-stream serialization guarantees at most 1 publish in flight per
        # stream, which keeps us safely inside the go-livepeer trickle server's
        # 5-slot ring buffer (trickle_server.go:82 — idx % 5 collision at depth
        # >= 5 causes segment eviction). Full parallelism across streams is
        # preserved — each stream has its own lock.
        status, headers = await asyncio.to_thread(_do_publish)

    return Response(status_code=status, headers=headers)
```

**Why `async with lock` wrapping `to_thread`, not inside `_do_publish`:** the Lock is an `asyncio.Lock`, valid only on the event loop thread. Acquiring it on the loop side is correct and non-blocking (`await lock.acquire()` yields). The thread-side work doesn't touch the lock at all.

### 5. `/stream/{id}/control` and `/stream/{id}/status` — simple wrap

Low frequency, no ordering constraint. Wrap the `urlopen` in `asyncio.to_thread` inside whatever helper they delegate to. No lock needed.

## Error Handling

Exceptions raised in the threaded function propagate back out of `await asyncio.to_thread(fn)` as ordinary exceptions. The existing `try / except NoOrchestratorAvailableError / except LivepeerGatewayError` blocks in each handler catch them unchanged — no error handling logic changes.

`urllib.error.URLError` and `urllib.error.HTTPError` are already caught where relevant in the current code. Wrapping doesn't change their propagation.

Timeouts in `urllib.request.urlopen(..., timeout=10)` still work — they raise `socket.timeout` from the thread, which propagates up through `to_thread`. Caller handlers already translate these into appropriate HTTP responses.

## Testing Strategy

Every design decision in this spec has at least one test that would fail if the decision were violated. Tests are grouped by the property they validate, not by test-harness layer. The harness details (shell script vs Playwright vs pytest) are secondary — what matters is the invariant each test locks in.

All tests run against the live `sdk-staging-1` VM post-deploy. Nothing mocks the orchestrator or the trickle server, because the design depends on real behavior of both. The spec's value is entirely in how the real system behaves under real load; mocks would hide the exact failures we're trying to prevent.

The test suite lives in `simple-infra/sdk-service-build/tests/` (new directory) as Python `pytest` files driven by a single `run-tests.sh` script. Python rather than shell because some tests need concurrent client threads and precise timing; `pytest` rather than bare Python because it gives per-test pass/fail reporting that is greppable in CI. Every test includes a one-line comment pointing at the spec decision it protects.

### T1 — Event loop stays free during long inference

**Protects:** the core design decision — blocking I/O is moved off the event loop via `asyncio.to_thread`.

**Method:** start an `ltx-i2v` inference call in one thread (expected to take 20–60 s). While it's in flight, hit `/health` 100 times at 50 ms intervals from another thread. Record each `/health` response time.

**Pass criteria:**
- Every `/health` call returns 200
- `/health` p50 ≤ 20 ms, p95 ≤ 50 ms, p99 ≤ 100 ms
- `/health` max ≤ 200 ms (catches any single-call stall)

**Failure signal:** if any `/health` response takes > 200 ms, the event loop was blocked — either `asyncio.to_thread` wasn't actually applied to `/inference`'s `submit_byoc_job` call, or a different handler still has a sync call. Both are regressions.

**Why this test exists:** the primary purpose of the whole PR. If this doesn't pass, nothing else matters.

### T2 — `/capabilities` stays fast during long inference

**Protects:** the interaction of the `feat/sdk-capabilities-cache` work with the non-blocking changes. Cache should be hit on every call while an inference is in flight.

**Method:** start an `ltx-i2v` inference call. During the 60 s window, hit `/capabilities` once per second for 30 s.

**Pass criteria:**
- Every `/capabilities` response ≤ 80 ms (accounts for TLS + Caddy + cache-hit path)
- Every response payload identical (proves we're hitting the cache, not re-fetching)
- No response takes > 150 ms (which would signal cache expiry coinciding with a blocked loop)

**Failure signal:** a single > 150 ms response means either the cache expired mid-inference (and the refresh blocked), or the event loop was stalled by a sync call we missed.

### T3 — Concurrent `/inference` + `/stream/start`

**Protects:** the "video gen doesn't block LV2V startup" property that was the original incident.

**Method:** start an `ltx-i2v` `/inference` call. Immediately (within 500 ms) issue a `/stream/start` POST for a new LV2V stream. Record response times and outcomes.

**Pass criteria:**
- Both calls return 200
- `/stream/start` returns within 15 s (the real gRPC work takes 5–10 s under good conditions; 15 s is the safety margin)
- `/stream/start`'s returned `stream_id` is reachable (a follow-up `/stream/{id}/status` call returns 200 within 1 s)
- `/inference` still eventually returns its expected result (20–60 s later)

**Failure signal:** if `/stream/start` takes > 20 s or times out, the event loop was serializing behind the inference — design broken.

### T4 — Frame-order integrity at trickle server

**Protects:** the per-stream lock decision, which exists specifically to prevent the 5-slot ring buffer eviction at `trickle_server.go:82`.

**Method:** start an LV2V stream. Publish 100 distinct-content frames (each frame's bytes contain the frame number so we can identify them later) with seq=0..99, driving the publish at **15 Hz** (deliberately faster than the production 10 Hz to force more in-flight overlap if any). For each publish, record the HTTP status and the `Lp-Trickle-Seq` response header returned by the trickle server.

**Pass criteria:**
- All 100 publishes return HTTP 200
- Every response's `Lp-Trickle-Seq` header value exactly matches the seq number submitted (proves no slot eviction)
- No two publishes for the same stream are in flight simultaneously — verified by instrumenting a test-only counter in `/stream/{id}/publish` that increments on entry and decrements on exit, and asserting it never exceeds 1 for any single `stream_id`

**Failure signal:** any `Lp-Trickle-Seq` mismatch means a publish lost its slot to a racing publish — the per-stream lock was not effective. Any counter > 1 means two publishes for the same stream were in flight concurrently — the lock was held at the wrong level.

**Why 15 Hz:** the test deliberately exceeds production rate so the test would catch the regression even if production rates happen to avoid the race window. A test that only passes at production rates is a test that passes tomorrow and fails the day after.

### T5 — Across-stream publish parallelism

**Protects:** the decision that the per-stream lock is per-**stream**, not global — two streams can publish simultaneously.

**Method:** start two LV2V streams concurrently. Publish 50 frames to each at 10 Hz, sharing the same wall clock. Record per-publish start and end times.

**Pass criteria:**
- All 100 publishes across both streams return 200
- At least 20 pairs of publishes (one from each stream) have overlapping `[start, end]` intervals (proves parallelism; a serialized implementation would have zero overlaps)
- Total wall time for both streams to publish all frames ≤ 6 s (a strictly serial implementation at 10 Hz would take ~10 s; parallel should finish in ~5 s)

**Failure signal:** zero overlap means the lock is global — regression of today's accidental behavior into intentional behavior.

### T6 — `ContextVar` propagation through `asyncio.to_thread`

**Protects:** the decision to use `asyncio.to_thread` instead of `loop.run_in_executor` specifically so `_current_signer_headers` propagates into the worker thread.

**Method:** issue a real `/inference` call with a valid `Authorization: Bearer sk_...` header. Inspect the SDK service logs to verify that the worker thread processing the BYOC submission saw the signer headers (the logs already include `signed by sender=...` at line ~356 in app.py which proves the signer roundtrip happened).

**Pass criteria:**
- `/inference` returns 200 with a valid result (not a 401 / 503 signer error)
- SDK logs include a `signed by sender=0x...` line for the request's job id
- If `/inference` returns 503 with a signer-related error, the ContextVar was not propagated

**Failure signal:** 503 with `"no payment tickets"` or `"signer rejected"` means `_current_signer_headers` was set on the loop but read on a thread that had no context. That would be a silent regression if we accidentally used `run_in_executor` instead of `to_thread` somewhere.

### T7 — Threadpool capacity under burst

**Protects:** the `max_workers=64` choice.

**Method:** fire 20 concurrent `/inference` calls (mix of `flux-schnell` for fast responses and `ltx-i2v` for slow). During the burst, hit `/health` 50 times at 100 ms intervals.

**Pass criteria:**
- All 20 inference calls eventually return (success or legitimate orch-side error — not a threadpool starvation timeout)
- `/health` latency during the burst: p99 ≤ 100 ms (same as T1, proving the event loop was never starved)
- Python threadpool never reports "queue full" (check via `executor._work_queue.qsize()` logged periodically during the test — added as a test-only shim; removed before merge)

**Failure signal:** if any `/health` call exceeds 100 ms during the burst, we don't have enough headroom. If the work queue ever exceeds 10, we're within a factor of 6 of saturation and should raise `max_workers`.

### T8 — Stream stop → 410 → client-side auto-stop

**Protects:** the lookup-failure-returns-410 decision in §4 and its client-side contract with `lib/stream/session.ts:167`.

**Method:** start an LV2V stream, publish 10 frames successfully, then call `/stream/{id}/stop`, then immediately (within 50 ms) attempt one more `/stream/{id}/publish`. Verify the response and client-side behavior.

**Pass criteria:**
- The post-stop publish returns **HTTP 410 Gone** (not 404, not 500)
- Running against the real `storyboard-a3` frontend (via Playwright): the stream card stops within 200 ms of the 410 and shows a "stream stopped" state, not a "stream died" error
- `_publish_locks` dict in the SDK does not contain the stream_id after `/stream/stop` (verified via a test-only `/debug/locks` endpoint added under a feature flag, or by correlating with log lines)

**Failure signal:** 200 or any non-410 status means the lock lifecycle is broken — stop() didn't clean up, or the publish handler looked up state that wasn't destroyed in sync with the lock.

### T9 — Reaper-cleanup of orphaned publish locks

**Protects:** the orphan-cleanup decision for `_publish_locks` — it must be removed from the dict when the stream reaper kills an idle stream.

**Method:** start an LV2V stream, do not publish anything, do not stop it. Wait for the reaper to kick in (documented as 30 s check interval, 2 min idle threshold). Verify the publish lock is gone after reap.

**Pass criteria:**
- After 3 min of no activity, attempting `/stream/{id}/publish` returns 410
- SDK logs show the reaper log line for the stream being killed
- No Python memory growth over a 10-minute idle window with 50 orphan streams (proves no lock dict leak)

**Failure signal:** 200 after reap means the lock dict wasn't cleaned up; memory growth means we're leaking Lock objects even though they're unreferenced by any session.

### T10 — LV2V end-to-end via frontend

**Protects:** the top-level user experience goal — real LV2V streams stay alive and produce output frames.

**Method:** run the existing Playwright harness in `storyboard-a3/tests/e2e/scope-phase*.spec.ts` against `sdk.daydream.monster` with the new SDK deployed. In addition, run a new Playwright test that:
1. Opens two browser contexts side-by-side
2. Starts an LV2V stream in each
3. In a third context, starts an `ltx-i2v` `/inference` via the chat UI
4. Waits 90 s
5. Verifies both LV2V stream cards are still alive (card has non-zero `pub:`/`recv:` counters, card is not showing an error or "stream stopped" state, card has received at least 10 output frames each)
6. Verifies the ltx-i2v card eventually produces its video output

**Pass criteria:**
- Both LV2V cards alive and receiving frames at t=90s
- ltx-i2v card produces its video within 120 s
- No console errors in any of the three contexts

**Failure signal:** anything less than this means the design did not solve the user-visible problem, regardless of whether the synthetic tests T1-T9 all pass.

### Test harness layout

```
simple-infra/sdk-service-build/tests/
  run-tests.sh                    # entrypoint: runs T1-T9 in order, aborts on fail
  conftest.py                     # shared fixtures: api_key, sdk_url, stream cleanup
  test_01_event_loop.py           # T1, T2, T3, T7
  test_02_publish_ordering.py     # T4, T5
  test_03_context_vars.py         # T6
  test_04_lifecycle.py            # T8, T9
  helpers/
    concurrent.py                 # thread-based concurrent client
    frame_gen.py                  # generates distinct-content JPEG frames with seq-encoded payload
    metrics.py                    # percentile calculation, overlap detection
```

T10 lives in the existing `storyboard-a3/tests/e2e/` directory as a new Playwright file since it drives the real frontend.

### Execution order and gating

Tests run strictly in this order, with the suite aborting on any failure:

1. **T1, T2** — baseline: non-blocking works
2. **T6** — ContextVars: signer auth still works (fastest failure if `run_in_executor` was accidentally used)
3. **T3** — concurrent inference + stream start
4. **T4, T5** — publish ordering and parallelism
5. **T8, T9** — lifecycle and cleanup
6. **T7** — threadpool burst stress (most expensive; only run if everything else passed)
7. **T10** — full frontend end-to-end (requires human observation for console error sniff)

Deployment gate: the hot patch is applied → all synthetic tests (T1-T9) run automatically → on full pass, T10 is run manually with Playwright headed mode → on full pass, PR is opened for the image rebuild.

A single failure in any test aborts the suite, the hot patch is reverted via `docker cp` of the pre-change `app.py.live`, and the failure is documented before any retry.

### Test-only code removal

Two tests require temporary instrumentation:
- T4's in-flight counter in `/stream/{id}/publish`
- T8's `/debug/locks` endpoint

Both are added behind an `SDK_TEST_INSTRUMENTATION=1` environment variable and gated on that env var at runtime. The env var is set for the test container only, never in the image shipped to production. Grep-ping `SDK_TEST_INSTRUMENTATION` before merge catches any accidental leftover. The plan will include a final task that explicitly verifies the env var is unset in production compose.

## Rollout

1. Edit `sdk-service-build/app.py` on `feat/sdk-nonblocking-io`, branched from `feat/sdk-capabilities-cache`.
2. Local syntax check (`python3 -c "import ast; ast.parse(open('app.py').read())"`).
3. Hot-patch the running container on `sdk-staging-1` via `docker cp` — same mechanism used for the cache change. This is ephemeral but lets us validate under real traffic without an image rebuild.
4. Run the three tests from the Testing Strategy section against `sdk.daydream.monster`.
5. If tests pass, open PR on `livepeer/simple-infra`. Merge, then rebuild the SDK image from the branch so the change is durable across future container recreates.
6. If any test fails, revert the hot patch by re-copying the pre-change `app.py.live` into the container. All edits are confined to one file, so revert is a single `docker cp`.

**Rollback story:** every change is additive (`async def` wraps, new lock dict, executor config). Reverting is `docker cp old-app.py sdk-service:/app/app.py && docker restart sdk-service`. No schema changes, no persistent state changes, no client-side coupling.

## Open Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Per-stream lock acquired but never released (bug in refactor) | Use `async with lock` — release is structurally guaranteed by Python. No manual `release()`. |
| Reaper races with in-flight publish — pops `_publish_locks` while a publish holds the lock | Existing acquirers already hold a reference to the `Lock` object, so popping the dict doesn't invalidate their hold. Next publish after pop fails lookup → 410 → client stops. |
| Threadpool saturation under burst | 64 threads vs ~30-thread worst case gives 2× headroom. If real traffic ever approaches saturation, bump `max_workers` at the single startup call site. |
| `ContextVar` not propagating to thread | `asyncio.to_thread` uses `copy_context()` by design (PEP 567 + asyncio 3.9). Verified in stdlib docs. Existing `_current_signer_headers` ContextVar propagates automatically. |
| Thread cannot be cancelled on client drop | Threads leak up to `urllib` timeout (10 s) per dropped request. At realistic drop rates (a few per minute) this is invisible on a 64-thread pool. Not designing around it. |
| 5-slot ring eviction under sustained high-latency publish | Per-stream lock guarantees strict sequential publishes per stream. Lock serialization means the ring is at most 1 slot deep per stream, regardless of upstream latency. |

## References

- `trickle_server.go:82` — `maxSegmentsPerStream = 5`, the ring buffer size that motivates the per-stream lock.
- `trickle_server.go:374–460` — `handlePost(idx)` confirming segment keying by idx and explicit out-of-order tolerance.
- `sdk-service-build/app.py:1225` — existing `run_in_executor` wrap for `start_lv2v`, establishing the pattern we extend.
- `storyboard-a3/lib/stream/session.ts:167` — client-side 410-as-terminal handling that our publish failure path relies on.
- `storyboard-a3/CLAUDE.md` — "VM Health & Auto-Recovery" section, updated 2026-04-12 with the multi-worker-broke-LV2V lesson this spec addresses properly.
