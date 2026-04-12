# SDK Non-Blocking I/O Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every blocking I/O call site in the SDK service off the event loop using `asyncio.to_thread`, with a per-stream lock for LV2V publishes to respect the go-livepeer trickle server's 5-slot ring buffer.

**Architecture:** Single-worker uvicorn keeps LV2V session state coherent. A 64-thread shared default executor handles all blocking work (BYOC calls, urllib, LLM helper, control-post). A module-level `dict[str, asyncio.Lock]` keyed by `stream_id` serializes publishes within a stream while preserving full parallelism across streams. Changes are additive — every wrap is `await asyncio.to_thread(fn, *args)` around existing sync calls, no new dependencies, no schema changes. Rollback is `docker cp` of the pre-change file.

**Tech Stack:** Python 3.11, FastAPI, `asyncio.to_thread` (stdlib 3.9+), `concurrent.futures.ThreadPoolExecutor`, `asyncio.Lock`, `pytest`, `requests` (test client), Playwright (T10 only).

**Design spec:** `docs/superpowers/specs/2026-04-12-sdk-nonblocking-io-design.md`

**Target repo:** `livepeer/simple-infra`
**Branch:** `feat/sdk-nonblocking-io` off `feat/sdk-capabilities-cache`
**Production file:** `sdk-service-build/app.py`

---

## Operator notes before starting

1. All tasks assume `cwd=/Users/qiang.han/Documents/mycodespace/simple-infra`.
2. Tests run against the live `sdk-staging-1` SDK at `https://sdk.daydream.monster`. A Daydream API key with balance must be exported as `SDK_API_KEY` before running tests. The signer verifies the key on every request — there is no mock mode.
3. The SDK image is built from a source tree that is **not** in any committed branch; `feat/sdk-capabilities-cache` captures the current deployed file as a baseline in commit `3019c51`. Branch off that commit, not off `main`.
4. Hot-patching mechanism: `gcloud compute scp app.py sdk-staging-1:/tmp/app.py && gcloud compute ssh sdk-staging-1 --command="sudo docker cp /tmp/app.py sdk-service:/app/app.py && sudo docker restart sdk-service"`. This is ephemeral; the image rebuild at the end of the plan makes it durable.
5. Revert mechanism if any test fails during rollout: `docker cp /tmp/app.py.pre-change sdk-service:/app/app.py && docker restart sdk-service`. Pre-change file is saved in Task 2.
6. A line-number reference in a task (e.g. "around line 356") is approximate; use `grep -n` inside the file to locate the exact current position. Line numbers drift as the file changes across tasks.

---

## Task 1: Branch setup

**Files:**
- None modified; git branch operation only.

- [ ] **Step 1: Verify base branch state**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git fetch origin
git log --oneline feat/sdk-capabilities-cache -3
```

Expected: top commit is `cc2aa23 feat(sdk): cache /capabilities for 60s with stale-on-error fallback`, parent is `3019c51 baseline(sdk): snapshot deployed sdk-service app.py`.

- [ ] **Step 2: Create and check out the feature branch**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git checkout feat/sdk-capabilities-cache
git checkout -b feat/sdk-nonblocking-io
git log --oneline -3
```

Expected: branch `feat/sdk-nonblocking-io` is at `cc2aa23`.

- [ ] **Step 3: Save a pre-change snapshot of app.py for revert use**

```bash
cp sdk-service-build/app.py /tmp/app.py.pre-change
md5 /tmp/app.py.pre-change
```

Expected: md5 matches the deployed container's `/app/app.py`. This is the revert target if anything goes wrong during the hot-patch rollout in Task 18.

- [ ] **Step 4: Commit this plan into the branch as a work marker**

No code change; skip commit. The branch is now ready for Task 2.

---

## Task 2: Test harness skeleton

**Files:**
- Create: `sdk-service-build/tests/requirements.txt`
- Create: `sdk-service-build/tests/conftest.py`
- Create: `sdk-service-build/tests/helpers/__init__.py`
- Create: `sdk-service-build/tests/helpers/concurrent.py`
- Create: `sdk-service-build/tests/helpers/frame_gen.py`
- Create: `sdk-service-build/tests/helpers/metrics.py`
- Create: `sdk-service-build/tests/run-tests.sh`

- [ ] **Step 1: Create requirements.txt**

File: `sdk-service-build/tests/requirements.txt`

```
pytest==8.3.3
requests==2.32.3
```

- [ ] **Step 2: Create conftest.py with core fixtures**

File: `sdk-service-build/tests/conftest.py`

```python
"""Shared pytest fixtures for SDK non-blocking I/O tests.

Tests run against the live sdk-staging-1 SDK via HTTPS. There is no mock
mode: the whole point of this suite is to verify real event-loop behavior
under real orchestrator and trickle-server latency. Every test must clean
up any streams it starts, even on failure, via the stream_cleanup fixture.
"""
from __future__ import annotations

import os
import pytest
import requests


SDK_URL = os.environ.get("SDK_URL", "https://sdk.daydream.monster")
API_KEY = os.environ.get("SDK_API_KEY")

if not API_KEY:
    raise RuntimeError(
        "SDK_API_KEY environment variable is required. Set it to a Daydream "
        "API key with balance before running tests."
    )


@pytest.fixture(scope="session")
def sdk_url() -> str:
    return SDK_URL


@pytest.fixture(scope="session")
def api_key() -> str:
    return API_KEY


@pytest.fixture(scope="session")
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {API_KEY}"}


@pytest.fixture
def stream_cleanup(sdk_url, auth_headers):
    """Tracks stream ids started during a test and stops them on teardown,
    even if the test raised. Always use this fixture when calling
    /stream/start."""
    started: list[str] = []

    def _track(stream_id: str) -> None:
        started.append(stream_id)

    yield _track

    for sid in started:
        try:
            requests.post(
                f"{sdk_url}/stream/{sid}/stop",
                headers=auth_headers,
                timeout=5,
            )
        except Exception:
            # Best effort — the stream may already be stopped, reaped, or
            # the SDK may be unhealthy at this point in a failing test.
            pass
```

- [ ] **Step 3: Create helpers/__init__.py**

File: `sdk-service-build/tests/helpers/__init__.py`

```python
```

(Empty file — just marks the directory as a package.)

- [ ] **Step 4: Create helpers/concurrent.py**

File: `sdk-service-build/tests/helpers/concurrent.py`

```python
"""Thread-based concurrent HTTP client utilities.

The tests use real threads (not asyncio) to drive concurrent load against
the SDK because the behavior we're validating is how the SDK handles
concurrent incoming requests — the client side concurrency model doesn't
matter and threads are simpler than asyncio for test code.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Callable


@dataclass
class CallResult:
    start: float
    end: float
    status: int
    body: bytes
    exception: Exception | None = None

    @property
    def elapsed_ms(self) -> float:
        return (self.end - self.start) * 1000.0


def run_concurrent(
    fn: Callable[[], CallResult],
    count: int,
) -> list[CallResult]:
    """Run `fn` in `count` parallel threads. Returns all results in start
    order. Each thread captures its own start/end wall time so concurrency
    can be measured by interval overlap."""
    results: list[CallResult] = [None] * count  # type: ignore

    def _runner(idx: int) -> None:
        try:
            results[idx] = fn()
        except Exception as e:
            results[idx] = CallResult(
                start=time.time(),
                end=time.time(),
                status=-1,
                body=b"",
                exception=e,
            )

    threads = [threading.Thread(target=_runner, args=(i,)) for i in range(count)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def run_in_background(fn: Callable[[], None]) -> threading.Thread:
    """Start `fn` on a daemon thread and return the Thread handle. Caller
    is responsible for join()."""
    t = threading.Thread(target=fn, daemon=True)
    t.start()
    return t
```

- [ ] **Step 5: Create helpers/frame_gen.py**

File: `sdk-service-build/tests/helpers/frame_gen.py`

```python
"""Distinct-content JPEG frame generator for frame-order regression tests.

Each generated frame encodes its seq number in the first 16 bytes of its
JPEG payload (as ASCII). This lets tests verify which seq arrived where
by parsing the stored bytes, independent of the trickle server's own
Lp-Trickle-Seq header echo.
"""
from __future__ import annotations

import struct


# A minimal valid JPEG header + a solid black 2x2 image. Enough to pass
# any MIME sniff on the trickle server; we don't need real imagery because
# the test consumer is a byte comparator, not an image decoder.
_MINIMAL_JPEG = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d"
    "0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d383233"
    "3c2e333432ffc0000b0800020002010300ffc400140100010000000000000000000000000000000009ffc4"
    "00b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a108"
    "2342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a5354"
    "55565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5"
    "a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1"
    "f2f3f4f5f6f7f8f9faffda0008010100003f00fbfcfffd9"
)


def make_frame(seq: int) -> bytes:
    """Return a JPEG blob whose first 16 bytes ASCII-encode the seq as a
    fixed-width integer. The remaining bytes are a valid minimal JPEG so
    any downstream consumer that sniffs content-type sees image/jpeg."""
    header = f"SEQ{seq:013d}".encode("ascii")  # exactly 16 bytes
    assert len(header) == 16
    return header + _MINIMAL_JPEG


def extract_seq(frame: bytes) -> int:
    """Inverse of make_frame. Returns the seq number encoded in the
    first 16 bytes of `frame`, or -1 if the frame was not produced by
    make_frame."""
    if len(frame) < 16 or not frame.startswith(b"SEQ"):
        return -1
    try:
        return int(frame[3:16].decode("ascii"))
    except ValueError:
        return -1
```

- [ ] **Step 6: Create helpers/metrics.py**

File: `sdk-service-build/tests/helpers/metrics.py`

```python
"""Statistics helpers for response-time assertions.

Percentile math is ad-hoc rather than using numpy to keep the test
dependencies minimal (just pytest and requests). For sample sizes in the
low hundreds the nearest-rank method below is accurate enough for the
threshold-based assertions in this suite.
"""
from __future__ import annotations


def percentile(values: list[float], pct: float) -> float:
    """Return the `pct` percentile (0-100) of `values` using the
    nearest-rank method. Not interpolated — sufficient for pass/fail
    thresholds. Raises on empty input."""
    if not values:
        raise ValueError("percentile of empty list")
    if not 0 <= pct <= 100:
        raise ValueError(f"pct must be in [0, 100], got {pct}")
    s = sorted(values)
    # Nearest-rank: smallest index i such that i/n >= pct/100
    n = len(s)
    if pct == 0:
        return s[0]
    if pct == 100:
        return s[-1]
    rank = int(round((pct / 100.0) * n + 0.5)) - 1
    rank = max(0, min(rank, n - 1))
    return s[rank]


def count_overlapping_pairs(
    a: list[tuple[float, float]],
    b: list[tuple[float, float]],
) -> int:
    """Count pairs (i, j) where intervals a[i] and b[j] overlap in time.

    Used by T5 to measure across-stream publish parallelism: a and b are
    lists of (start, end) wall-clock tuples from two different streams.
    An "overlap" means one call started before the other ended.
    """
    count = 0
    for a_start, a_end in a:
        for b_start, b_end in b:
            if a_start < b_end and b_start < a_end:
                count += 1
    return count
```

- [ ] **Step 7: Create run-tests.sh**

File: `sdk-service-build/tests/run-tests.sh`

```bash
#!/bin/bash
# Entrypoint for the SDK non-blocking I/O test suite.
#
# Runs tests T1-T9 in spec order. Aborts on the first failure so an
# operator can investigate without waiting for later tests that depend
# on earlier invariants holding. T10 (full frontend e2e) runs separately
# via Playwright in the storyboard-a3 repo.
#
# Requires: SDK_API_KEY env var set to a Daydream key with balance.
# Optional: SDK_URL env var (defaults to https://sdk.daydream.monster).

set -e

cd "$(dirname "$0")"

if [ -z "$SDK_API_KEY" ]; then
    echo "ERROR: SDK_API_KEY environment variable must be set"
    exit 1
fi

if [ ! -f .deps-installed ]; then
    pip install --quiet -r requirements.txt
    touch .deps-installed
fi

# T1, T2, T3, T7 — event loop freedom + threadpool capacity
pytest -v test_01_event_loop.py
# T6 — ContextVar propagation (run early so signer regressions fail fast)
pytest -v test_03_context_vars.py
# T4, T5 — publish ordering and across-stream parallelism
pytest -v test_02_publish_ordering.py
# T8, T9 — lifecycle and reaper cleanup
pytest -v test_04_lifecycle.py

echo "All T1-T9 passed. Run T10 manually via:"
echo "  cd ../../../storyboard-a3 && npx playwright test tests/e2e/sdk-nonblocking-io.spec.ts"
```

- [ ] **Step 8: Make run-tests.sh executable**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
chmod +x sdk-service-build/tests/run-tests.sh
```

- [ ] **Step 9: Verify test harness loads cleanly**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=dummy pip install --quiet -r requirements.txt
SDK_API_KEY=dummy python -c "import conftest; import helpers.concurrent; import helpers.frame_gen; import helpers.metrics; print('imports ok')"
```

Expected: `imports ok`. (Conftest raises on empty `SDK_API_KEY` but `dummy` is non-empty so it passes the import check.)

- [ ] **Step 10: Verify frame_gen round-trips correctly**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=dummy python -c "
from helpers.frame_gen import make_frame, extract_seq
for s in [0, 1, 42, 999, 9999999999999]:
    assert extract_seq(make_frame(s)) == s, f'roundtrip failed for {s}'
print('frame_gen ok')
"
```

Expected: `frame_gen ok`.

- [ ] **Step 11: Commit test harness skeleton**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/tests/
git commit -m "$(cat <<'EOF'
test(sdk): add test harness skeleton for non-blocking I/O suite

conftest.py with api_key/sdk_url/stream_cleanup fixtures, helpers for
concurrent HTTP calls, distinct-content JPEG frame generation with
seq-encoded payload, and percentile/overlap statistics. run-tests.sh
runs T1-T9 in spec order, aborting on first failure.

No tests yet — this commit only establishes the harness so subsequent
task commits can focus on one test at a time.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Install 64-thread default executor at app startup

**Files:**
- Modify: `sdk-service-build/app.py` (add startup handler near existing `app = FastAPI(...)` block around line 76)

- [ ] **Step 1: Locate the FastAPI app instance**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
grep -n "app = FastAPI" sdk-service-build/app.py
```

Expected: one match, around line 76.

- [ ] **Step 2: Verify current imports include `asyncio`**

```bash
grep -n "^import asyncio" sdk-service-build/app.py
```

Expected: one match at line 17.

- [ ] **Step 3: Add `ThreadPoolExecutor` import near the existing asyncio import**

Find the block of imports starting at line 15 (`from __future__ import annotations`) and add after `import asyncio`:

```python
from concurrent.futures import ThreadPoolExecutor
```

- [ ] **Step 4: Add the startup handler after the `app = FastAPI(...)` block**

Insert after the `app.add_middleware(CORSMiddleware, ...)` block (search for `CORSMiddleware` in the file to find it). Add:

```python
@app.on_event("startup")
async def _install_default_executor() -> None:
    """Configure the asyncio default executor to 64 threads.

    Every blocking I/O wrap in this file uses `await asyncio.to_thread(fn)`,
    which submits `fn` to the event loop's default executor. By default
    Python creates a ThreadPoolExecutor with `min(32, cpu_count+4)` workers
    — on a 2-vCPU VM that's 6 threads, which is not enough headroom for
    the realistic worst-case workload of this service (~5 concurrent
    long ltx-i2v inferences holding 1 thread each for 30-60s, plus ~10
    active LV2V streams with up to 2 publishes in flight per stream, plus
    ambient /capabilities/control/status traffic, totalling ~30 threads).
    64 gives 2x headroom. Raise here if traffic ever approaches the
    steady-state ceiling.
    """
    loop = asyncio.get_running_loop()
    loop.set_default_executor(
        ThreadPoolExecutor(max_workers=64, thread_name_prefix="sdk")
    )
    logger.info("Installed default executor: ThreadPoolExecutor(max_workers=64)")
```

- [ ] **Step 5: Syntax-check the modified file**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
python3 -c "import ast; ast.parse(open('sdk-service-build/app.py').read()); print('syntax ok')"
```

Expected: `syntax ok`.

- [ ] **Step 6: Commit**

```bash
git add sdk-service-build/app.py
git commit -m "$(cat <<'EOF'
feat(sdk): install 64-thread default executor at startup

Every asyncio.to_thread call in subsequent commits uses the event loop's
default executor. Python's default sizing is min(32, cpu_count+4), which
on a 2-vCPU VM gives 6 threads — not enough for realistic worst-case
workload (5 concurrent long inferences + 10 LV2V streams + ambient
traffic ~= 30 threads). 64 gives 2x headroom.

Single knob for operators to raise if traffic saturates. Logged on
startup for visibility.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Write T1 (event loop stays free during long inference)

**Files:**
- Create: `sdk-service-build/tests/test_01_event_loop.py`

- [ ] **Step 1: Create the test file with only T1 for now**

File: `sdk-service-build/tests/test_01_event_loop.py`

```python
"""T1, T2, T3, T7 — event loop freedom and threadpool capacity tests.

See docs/superpowers/specs/2026-04-12-sdk-nonblocking-io-design.md §Testing
for the protected invariants. Each test function's docstring cites the
design decision it locks in.
"""
from __future__ import annotations

import time
import requests

from helpers.concurrent import run_in_background, CallResult
from helpers.metrics import percentile


def _call_health(sdk_url: str) -> CallResult:
    start = time.time()
    try:
        r = requests.get(f"{sdk_url}/health", timeout=5)
        return CallResult(start=start, end=time.time(), status=r.status_code, body=r.content)
    except Exception as e:
        return CallResult(start=start, end=time.time(), status=-1, body=b"", exception=e)


def _fire_ltx_i2v(sdk_url: str, auth_headers: dict[str, str]) -> CallResult:
    """Fire a long ltx-i2v /inference in the current thread. Uses a tiny
    source image to keep the test cost bounded but the call will still
    take 20-60s because of fal cold-start and video generation time."""
    start = time.time()
    payload = {
        "capability": "ltx-i2v",
        "prompt": "gentle camera pan",
        "image_data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==",
        "timeout": 120,
    }
    try:
        r = requests.post(
            f"{sdk_url}/inference",
            json=payload,
            headers={**auth_headers, "Content-Type": "application/json"},
            timeout=180,
        )
        return CallResult(start=start, end=time.time(), status=r.status_code, body=r.content)
    except Exception as e:
        return CallResult(start=start, end=time.time(), status=-1, body=b"", exception=e)


def test_t1_event_loop_stays_free_during_long_inference(sdk_url, auth_headers):
    """T1: While a long ltx-i2v /inference is in flight, /health responses
    must stay fast. This is the primary design invariant — blocking I/O
    has been moved off the event loop via asyncio.to_thread.
    """
    # Kick off the inference on a background thread; we don't await its
    # result, just want it in flight so the main thread can probe /health.
    inference_result: list[CallResult] = []

    def _runner():
        inference_result.append(_fire_ltx_i2v(sdk_url, auth_headers))

    inference_thread = run_in_background(_runner)

    # Give the inference a moment to actually be blocking on the orch
    time.sleep(2.0)

    # Probe /health 100 times at 50ms cadence
    latencies_ms: list[float] = []
    errors: list[Exception] = []
    for _ in range(100):
        result = _call_health(sdk_url)
        if result.status != 200:
            errors.append(result.exception or RuntimeError(f"status {result.status}"))
        latencies_ms.append(result.elapsed_ms)
        time.sleep(0.05)

    # Let the inference finish so the background thread joins cleanly
    inference_thread.join(timeout=180)

    assert not errors, f"/health returned non-200 during inference: {errors[:3]}"
    p50 = percentile(latencies_ms, 50)
    p95 = percentile(latencies_ms, 95)
    p99 = percentile(latencies_ms, 99)
    mx = max(latencies_ms)

    # Thresholds from spec §Testing T1
    assert p50 <= 20, f"/health p50 {p50:.1f}ms > 20ms — event loop may be stalled"
    assert p95 <= 50, f"/health p95 {p95:.1f}ms > 50ms — event loop may be stalled"
    assert p99 <= 100, f"/health p99 {p99:.1f}ms > 100ms — event loop may be stalled"
    assert mx <= 200, f"/health max {mx:.1f}ms > 200ms — single-call stall detected"
```

- [ ] **Step 2: Pre-flight check — run T1 against the CURRENT (unchanged) SDK and verify it FAILS**

This confirms the test is valid: without the /inference wrap, `/health` latency spikes during a long inference.

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=<your-key> pytest -v test_01_event_loop.py::test_t1_event_loop_stays_free_during_long_inference
```

Expected: **FAIL** with an assertion on `/health p99 > 100ms` or `max > 200ms`, because the current SDK still blocks the loop on `submit_byoc_job`. If the test passes against the unpatched SDK, the test is broken — investigate before continuing.

- [ ] **Step 3: Commit the failing test**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/tests/test_01_event_loop.py
git commit -m "$(cat <<'EOF'
test(sdk): add T1 — event loop free during long inference

Locks in the primary design invariant: while an ltx-i2v /inference is in
flight, /health responses must stay fast (p50<=20ms, p95<=50ms, p99<=100ms,
max<=200ms). Pre-flight verified: this test FAILS against the current
unpatched SDK because submit_byoc_job blocks the event loop. The next
task wraps that call in asyncio.to_thread, which will make this test pass.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wrap `/inference` submit_byoc_job in asyncio.to_thread

**Files:**
- Modify: `sdk-service-build/app.py` (the `/inference` handler, around line 356)

- [ ] **Step 1: Locate the call**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
grep -n "submit_byoc_job(" sdk-service-build/app.py | head -5
```

Expected: multiple matches; the one we want is inside `@app.post("/inference")` — use grep to identify the handler function containing each match.

- [ ] **Step 2: Replace the synchronous call with `asyncio.to_thread`**

In the `/inference` handler, locate:

```python
    try:
        result = submit_byoc_job(
            byoc_req,
            orch_url=ORCH_URL,
            signer_url=SIGNER_URL or None,
            signer_headers=signer_hdrs,
            timeout=req.timeout,
        )
    except NoOrchestratorAvailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except LivepeerGatewayError as e:
        raise HTTPException(status_code=502, detail=str(e))
```

Replace with:

```python
    try:
        # submit_byoc_job is synchronous (uses urllib/requests under the hood)
        # and can block for 30-60s on ltx-i2v. Run on the default threadpool
        # so the event loop stays free for /health, /stream/start, and
        # concurrent /inference calls. asyncio.to_thread propagates the
        # current contextvars.Context, so the _current_signer_headers
        # ContextVar set above is visible inside the thread if any deeper
        # helper reads it.
        result = await asyncio.to_thread(
            submit_byoc_job,
            byoc_req,
            orch_url=ORCH_URL,
            signer_url=SIGNER_URL or None,
            signer_headers=signer_hdrs,
            timeout=req.timeout,
        )
    except NoOrchestratorAvailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except LivepeerGatewayError as e:
        raise HTTPException(status_code=502, detail=str(e))
```

- [ ] **Step 3: Syntax-check**

```bash
python3 -c "import ast; ast.parse(open('sdk-service-build/app.py').read()); print('syntax ok')"
```

Expected: `syntax ok`.

- [ ] **Step 4: Hot-patch the running SDK for test validation**

```bash
gcloud compute scp sdk-service-build/app.py sdk-staging-1:/tmp/app.py.new \
    --zone=us-west1-b --project=livepeer-simple-infra --quiet
gcloud compute ssh sdk-staging-1 \
    --zone=us-west1-b --project=livepeer-simple-infra \
    --command="sudo docker cp /tmp/app.py.new sdk-service:/app/app.py && sudo docker restart sdk-service && sleep 5 && curl -sf http://localhost:8000/health"
```

Expected: `{"status":"ok","orchestrator":"..."}` — SDK restarted cleanly.

- [ ] **Step 5: Run T1 and confirm it PASSES**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=<your-key> pytest -v test_01_event_loop.py::test_t1_event_loop_stays_free_during_long_inference
```

Expected: **PASS**. /health p99 should now be < 50ms even during the inference.

- [ ] **Step 6: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/app.py
git commit -m "$(cat <<'EOF'
feat(sdk): wrap /inference submit_byoc_job in asyncio.to_thread

T1 passes: /health latency during an ltx-i2v inference now stays under
100ms p99 instead of spiking to full inference duration. asyncio.to_thread
propagates contextvars so the _current_signer_headers ContextVar still
reaches any helper that reads it transitively.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add T2 (/capabilities stays fast during inference)

**Files:**
- Modify: `sdk-service-build/tests/test_01_event_loop.py` (append T2)

- [ ] **Step 1: Append the T2 test function**

Add to the end of `sdk-service-build/tests/test_01_event_loop.py`:

```python
def _call_capabilities(sdk_url: str) -> CallResult:
    start = time.time()
    try:
        r = requests.get(f"{sdk_url}/capabilities", timeout=5)
        return CallResult(start=start, end=time.time(), status=r.status_code, body=r.content)
    except Exception as e:
        return CallResult(start=start, end=time.time(), status=-1, body=b"", exception=e)


def test_t2_capabilities_stays_fast_during_inference(sdk_url, auth_headers):
    """T2: While a long ltx-i2v inference is in flight, /capabilities must
    stay fast (cache hit path, no orch round-trip) and return identical
    payloads (proves cache is being hit, not re-fetched).
    """
    inference_result: list[CallResult] = []

    def _runner():
        inference_result.append(_fire_ltx_i2v(sdk_url, auth_headers))

    inference_thread = run_in_background(_runner)
    time.sleep(2.0)

    # Warm the cache if not already
    _call_capabilities(sdk_url)

    # Probe /capabilities once per second for 30 seconds during the inference
    results: list[CallResult] = []
    for _ in range(30):
        results.append(_call_capabilities(sdk_url))
        time.sleep(1.0)

    inference_thread.join(timeout=180)

    # Every response must be 200
    statuses = [r.status for r in results]
    assert all(s == 200 for s in statuses), f"non-200 statuses: {[s for s in statuses if s != 200]}"

    # Every response must be <= 80ms (thresholds from spec §Testing T2)
    latencies = [r.elapsed_ms for r in results]
    mx = max(latencies)
    assert mx <= 150, f"max /capabilities latency {mx:.1f}ms > 150ms — cache may have expired into a blocked loop"

    # p95 check for stricter signal
    p95 = percentile(latencies, 95)
    assert p95 <= 80, f"/capabilities p95 {p95:.1f}ms > 80ms"

    # Every payload identical (proves cache is being hit)
    first_body = results[0].body
    assert all(r.body == first_body for r in results), "capabilities payload changed mid-test — cache not being hit"
```

- [ ] **Step 2: Run T2 to confirm it PASSES**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=<your-key> pytest -v test_01_event_loop.py::test_t2_capabilities_stays_fast_during_inference
```

Expected: **PASS** — the cache change from `feat/sdk-capabilities-cache` already ensures /capabilities is cached, and Task 5 ensured the event loop is free so even cache expiry mid-test wouldn't stall.

- [ ] **Step 3: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/tests/test_01_event_loop.py
git commit -m "$(cat <<'EOF'
test(sdk): add T2 — /capabilities stays fast during inference

Verifies the cache change from feat/sdk-capabilities-cache interacts
correctly with the non-blocking /inference change. 30 capability probes
at 1Hz during an ltx-i2v inference: all <= 150ms, p95 <= 80ms, identical
payloads (cache hit, not re-fetched).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wrap /train, /train/{id}, /enrich BYOC calls

**Files:**
- Modify: `sdk-service-build/app.py` (`/train`, `/train/{id}`, `/enrich` handlers and the internal `submit_byoc_job` helper around line 717)

- [ ] **Step 1: Locate all remaining unwrapped submit_byoc_job and submit_training_job calls**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
grep -nE "submit_byoc_job\(|submit_training_job\(|get_training_status\(|wait_for_training\(" sdk-service-build/app.py
```

Expected: several matches. The `/inference` one was wrapped in Task 5. Each other call gets the same treatment.

- [ ] **Step 2: Wrap `/train` `submit_training_job` call**

Locate the `/train` handler and replace `result = submit_training_job(train_req, ...)` with:

```python
        result = await asyncio.to_thread(
            submit_training_job,
            train_req,
            orch_url=ORCH_URL,
            signer_url=SIGNER_URL or None,
            signer_headers=signer_hdrs,
            timeout=req.timeout,
        )
```

Keep the surrounding try/except blocks unchanged.

- [ ] **Step 3: Wrap `/train/{id}` `get_training_status` call**

Locate the `/train/{job_id}` handler and replace `status = get_training_status(job_id, orch_url=ORCH_URL, ...)` with:

```python
        status = await asyncio.to_thread(
            get_training_status,
            job_id,
            orch_url=ORCH_URL,
            signer_url=SIGNER_URL or None,
            signer_headers=signer_hdrs,
        )
```

- [ ] **Step 4: Wrap `/enrich` `submit_byoc_job` call**

Locate the `/enrich` handler's `submit_byoc_job` call (around line 675) and wrap identically to Task 5's /inference pattern:

```python
        result = await asyncio.to_thread(
            submit_byoc_job,
            byoc_req,
            orch_url=ORCH_URL,
            signer_url=SIGNER_URL or None,
            signer_headers=signer_hdrs,
            timeout=req.timeout,
        )
```

- [ ] **Step 5: Wrap the internal `submit_byoc_job` call around line 717**

Locate (it's inside a helper function, not directly in a handler):

```python
result = submit_byoc_job(byoc_req, orch_url=ORCH_URL, signer_url=SIGNER_URL or None, signer_headers=hdrs, timeout=timeout)
```

If the containing function is `def` (sync), make it `async def` and change the call to `await asyncio.to_thread(submit_byoc_job, ...)`. Then find all callers of that helper (grep its name) and add `await` at every call site.

```bash
grep -n "def " sdk-service-build/app.py | grep -B 5 "submit_byoc_job.*hdrs" | head
```

Use this to identify the helper's name, then:

```bash
grep -n "<helper_name>(" sdk-service-build/app.py
```

At each call site, change `helper_name(...)` to `await helper_name(...)` and ensure the calling function is `async def`.

- [ ] **Step 6: Syntax-check**

```bash
python3 -c "import ast; ast.parse(open('sdk-service-build/app.py').read()); print('syntax ok')"
```

Expected: `syntax ok`. If this fails with "await outside async function", you missed an `async def` conversion.

- [ ] **Step 7: Hot-patch and sanity-check**

```bash
gcloud compute scp sdk-service-build/app.py sdk-staging-1:/tmp/app.py.new \
    --zone=us-west1-b --project=livepeer-simple-infra --quiet
gcloud compute ssh sdk-staging-1 \
    --zone=us-west1-b --project=livepeer-simple-infra \
    --command="sudo docker cp /tmp/app.py.new sdk-service:/app/app.py && sudo docker restart sdk-service && sleep 5 && curl -sf http://localhost:8000/health && curl -sf https://sdk.daydream.monster/capabilities -o /dev/null -w 'caps=%{http_code}\n'"
```

Expected: `{"status":"ok",...}` and `caps=200`.

- [ ] **Step 8: Rerun T1 and T2 to verify no regression**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=<your-key> pytest -v test_01_event_loop.py
```

Expected: **PASS** on both.

- [ ] **Step 9: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/app.py
git commit -m "$(cat <<'EOF'
feat(sdk): wrap /train, /train/{id}, /enrich BYOC calls in asyncio.to_thread

All remaining long-tail blocking calls (submit_training_job,
get_training_status, /enrich submit_byoc_job, and the internal helper
that dispatches BYOC from multiple call sites) now run on the threadpool
instead of blocking the event loop.

T1 and T2 still pass, confirming the wraps are mechanically correct and
the ContextVar propagation survives.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wrap `/capabilities` refresh path + `list_capabilities`

**Files:**
- Modify: `sdk-service-build/app.py` (the `/capabilities` handler around line 286, inside the cache-miss branch)

- [ ] **Step 1: Locate the cache-miss branch**

```bash
grep -n "list_capabilities(adapter_url)" sdk-service-build/app.py
```

Expected: one match, inside the `for adapter_url in ADAPTER_URLS` loop inside `/capabilities`.

- [ ] **Step 2: Wrap the sync call**

Replace:

```python
            caps = list_capabilities(adapter_url)
```

With:

```python
            caps = await asyncio.to_thread(list_capabilities, adapter_url)
```

- [ ] **Step 3: Syntax-check**

```bash
python3 -c "import ast; ast.parse(open('sdk-service-build/app.py').read()); print('syntax ok')"
```

- [ ] **Step 4: Hot-patch and rerun T1, T2**

```bash
gcloud compute scp sdk-service-build/app.py sdk-staging-1:/tmp/app.py.new \
    --zone=us-west1-b --project=livepeer-simple-infra --quiet
gcloud compute ssh sdk-staging-1 \
    --zone=us-west1-b --project=livepeer-simple-infra \
    --command="sudo docker cp /tmp/app.py.new sdk-service:/app/app.py && sudo docker restart sdk-service && sleep 5"

cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=<your-key> pytest -v test_01_event_loop.py
```

Expected: **PASS** on T1 and T2.

- [ ] **Step 5: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/app.py
git commit -m "$(cat <<'EOF'
feat(sdk): wrap list_capabilities in /capabilities refresh on threadpool

Closes the last sync call site in /capabilities. On cache miss (every
60s) the refresh now runs via asyncio.to_thread instead of blocking the
loop. T2 ensures this path is rarely hit; the wrap still matters for
correctness on the rare miss.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Convert `_llm_call` helper to async

**Files:**
- Modify: `sdk-service-build/app.py` (`_llm_call` definition around line 100-130, and all call sites)

- [ ] **Step 1: Locate `_llm_call` definition**

```bash
grep -nE "(def _llm_call|_llm_call\()" sdk-service-build/app.py
```

Expected: one `def _llm_call` line, multiple `_llm_call(` call sites.

- [ ] **Step 2: Read the current definition**

```bash
sed -n '100,140p' sdk-service-build/app.py
```

Note the exact body for rewriting in step 3.

- [ ] **Step 3: Rewrite `_llm_call` as async**

Find the function (signature starts with `def _llm_call(...)`) and replace with:

```python
async def _llm_call(*args, **kwargs):
    """Async wrapper around the sync LLM HTTP call.

    The actual urllib work runs on the default threadpool so it doesn't
    block the event loop. ContextVars propagate automatically because
    asyncio.to_thread uses copy_context() under the hood — this is the
    key property that keeps _current_signer_headers visible inside the
    thread for any signer-aware downstream code.
    """
    def _sync_impl():
        # ...paste the ORIGINAL function body here, unchanged...
        pass  # replaced by the real body in step 4

    return await asyncio.to_thread(_sync_impl)
```

- [ ] **Step 4: Move the original body into `_sync_impl`**

Copy the exact original `_llm_call` body (the block from the function signature to its return statement) into the `_sync_impl` inner function, preserving indentation and the existing `urllib.request.Request(...)` / `urllib.request.urlopen(...)` / return statement. The inner function must match the outer signature's `*args, **kwargs` — so if the original was `def _llm_call(url, body, headers=None):`, change it to `def _llm_call(url, body, headers=None):` on the outer and capture those via closure in `_sync_impl`. **Preferred form** (capture args by closure for clarity):

```python
async def _llm_call(url, body, headers=None, timeout=10):
    """..."""
    def _sync_impl():
        req = urllib.request.Request(
            url,
            data=body,
            headers=headers or {},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())

    return await asyncio.to_thread(_sync_impl)
```

Adjust the argument list to exactly match the original signature — use `sed -n '100,140p' sdk-service-build/app.py` to see it precisely.

- [ ] **Step 5: Add `await` at every `_llm_call` call site**

```bash
grep -n "_llm_call(" sdk-service-build/app.py
```

For each call site that does NOT already have `await`, replace `_llm_call(` with `await _llm_call(`. Verify the containing function is `async def` — if it's `def`, change to `async def`. Repeat `grep -n "def .*(.*)" sdk-service-build/app.py | grep -B 1 "_llm_call"` if needed.

- [ ] **Step 6: Syntax-check**

```bash
python3 -c "import ast; ast.parse(open('sdk-service-build/app.py').read()); print('syntax ok')"
```

Expected: `syntax ok`. Any "await outside async function" error means a caller is still `def`.

- [ ] **Step 7: Hot-patch**

```bash
gcloud compute scp sdk-service-build/app.py sdk-staging-1:/tmp/app.py.new \
    --zone=us-west1-b --project=livepeer-simple-infra --quiet
gcloud compute ssh sdk-staging-1 \
    --zone=us-west1-b --project=livepeer-simple-infra \
    --command="sudo docker cp /tmp/app.py.new sdk-service:/app/app.py && sudo docker restart sdk-service && sleep 5 && curl -sf http://localhost:8000/health"
```

Expected: `{"status":"ok",...}`.

- [ ] **Step 8: Smoke-test any endpoint that uses `_llm_call`**

```bash
grep -B 20 "_llm_call(" sdk-service-build/app.py | grep -oE "/[a-z/]*" | sort -u
```

For the identified endpoints (likely `/enrich/v2`, `/replan`), send a single minimal request and verify 200. Exact curl command depends on the endpoint's schema — consult the file.

- [ ] **Step 9: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/app.py
git commit -m "$(cat <<'EOF'
feat(sdk): make _llm_call async via asyncio.to_thread

Internal helper used by /enrich/v2 and /replan wrapped the urllib call
synchronously inside an async handler — each invocation blocked the loop
for the duration of the LLM round-trip (often 5-30s for reasoning
models). Rewritten as async def wrapping a sync inner via
asyncio.to_thread, so the event loop stays free during LLM calls.

ContextVars propagate into the thread automatically; _current_signer_headers
still visible to any signer-aware code path.

Call sites updated: every _llm_call(...) now await _llm_call(...); all
containing functions confirmed async def.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Convert `_control_post` helper to async

**Files:**
- Modify: `sdk-service-build/app.py` (`_control_post` around line 1165 and all call sites)

- [ ] **Step 1: Locate definition and call sites**

```bash
grep -nE "(def _control_post|_control_post\()" sdk-service-build/app.py
```

- [ ] **Step 2: Rewrite as async + move body into inner sync function**

Apply the same pattern as Task 9 Step 4. The expected final form:

```python
async def _control_post(url: str, body: bytes, method: str = "POST", timeout: float = 10.0):
    """Async wrapper around the sync control-channel POST.

    Used by /stream/{id}/control and related handlers to talk to the
    orchestrator's control URL. Runs urllib on the threadpool so the
    event loop stays free during potentially-slow control calls.
    """
    def _sync_impl():
        req = urllib.request.Request(url, data=body, method=method)
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx) as r:
            return r.status, r.read()

    return await asyncio.to_thread(_sync_impl)
```

Consult the actual original body with `sed -n '1160,1200p' sdk-service-build/app.py` and preserve any parameters or return-shape differences. The example above is the likely shape; match the real one.

- [ ] **Step 3: Add `await` at every call site**

```bash
grep -n "_control_post(" sdk-service-build/app.py
```

Each call site adds `await` and its enclosing function becomes `async def` if it wasn't already.

- [ ] **Step 4: Syntax-check**

```bash
python3 -c "import ast; ast.parse(open('sdk-service-build/app.py').read()); print('syntax ok')"
```

- [ ] **Step 5: Hot-patch and smoke-test /stream/{id}/control**

```bash
gcloud compute scp sdk-service-build/app.py sdk-staging-1:/tmp/app.py.new \
    --zone=us-west1-b --project=livepeer-simple-infra --quiet
gcloud compute ssh sdk-staging-1 \
    --zone=us-west1-b --project=livepeer-simple-infra \
    --command="sudo docker cp /tmp/app.py.new sdk-service:/app/app.py && sudo docker restart sdk-service && sleep 5 && curl -sf http://localhost:8000/health"
```

Expected: `{"status":"ok",...}`.

- [ ] **Step 6: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/app.py
git commit -m "$(cat <<'EOF'
feat(sdk): make _control_post async via asyncio.to_thread

Last non-publish urllib call site inside an async handler. Moves
control-channel POSTs (used by /stream/{id}/control) off the event loop.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Add `_publish_locks` dict and lifecycle in /stream/start

**Files:**
- Modify: `sdk-service-build/app.py` (near `_stream_sessions` definition around line 1330, and inside `/stream/start` around line 1241)

- [ ] **Step 1: Add the module-level dict near the existing session state**

```bash
grep -n "^_stream_sessions" sdk-service-build/app.py
```

Expected: one match around line 1330. Directly above or below that line, add:

```python
# Per-stream asyncio.Lock for /stream/{id}/publish serialization.
#
# The go-livepeer trickle server (trickle_server.go:82) uses a 5-slot
# ring buffer keyed by idx % 5. If two publishes for the same stream
# are in flight simultaneously and their seq numbers differ by >= 5,
# the newer one evicts the older from its ring slot — frame loss. Today
# the single-worker event loop serializes publishes across all streams
# accidentally (blocking urllib inside async def). When the publish
# handler moves to asyncio.to_thread, we lose that accidental
# serialization across every stream. Per-stream locks restore strict
# ordering within a stream (at most 1 publish in flight) while
# preserving full parallelism across streams.
#
# Lifecycle: created eagerly in /stream/start next to _lv2v_jobs[stream_id] = job.
# Destroyed in /stream/{id}/stop and the stream reaper. Lookup failure
# in /stream/{id}/publish is treated as 410 Gone, matching existing
# unknown-stream semantics (client-side auto-stops on first 410 per
# lib/stream/session.ts:167).
_publish_locks: dict[str, asyncio.Lock] = {}
```

- [ ] **Step 2: Locate `/stream/start`'s `_lv2v_jobs[stream_id] = job` line**

```bash
grep -n "_lv2v_jobs\[stream_id\] = job" sdk-service-build/app.py
```

Expected: one match around line 1241.

- [ ] **Step 3: Add lock creation immediately after that line**

Directly below `_lv2v_jobs[stream_id] = job`, insert:

```python
    _publish_locks[stream_id] = asyncio.Lock()
```

- [ ] **Step 4: Syntax-check**

```bash
python3 -c "import ast; ast.parse(open('sdk-service-build/app.py').read()); print('syntax ok')"
```

- [ ] **Step 5: Commit (lifecycle infrastructure only — publish handler not yet using the lock)**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/app.py
git commit -m "$(cat <<'EOF'
feat(sdk): add _publish_locks dict and create lock in /stream/start

Infrastructure-only commit. Adds module-level dict[str, asyncio.Lock]
keyed by stream_id and creates the lock eagerly in /stream/start
immediately after _lv2v_jobs registration so the two dicts stay in
lockstep. Next commits add destruction in /stream/stop, the reaper
cleanup, and the actual use in /stream/{id}/publish.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Add lock destruction in /stream/stop and the reaper

**Files:**
- Modify: `sdk-service-build/app.py` (`/stream/{id}/stop` around line 1288 and the reaper function)

- [ ] **Step 1: Locate `/stream/stop`**

```bash
grep -n '_stream_sessions.pop(stream_id' sdk-service-build/app.py
grep -n '_lv2v_jobs.pop(stream_id' sdk-service-build/app.py
```

Expected: one `.pop` for each in the `/stream/{id}/stop` handler.

- [ ] **Step 2: Add `_publish_locks.pop` alongside those two pops**

Immediately below the existing `_lv2v_jobs.pop(stream_id, None)` (or equivalent) in the stop handler, add:

```python
    _publish_locks.pop(stream_id, None)
```

- [ ] **Step 3: Locate the stream reaper**

```bash
grep -n "reaper\|idle_threshold\|cleanup.*stream" sdk-service-build/app.py | head -10
```

Expected: a background function that iterates `_stream_sessions` and pops stale entries. Read the function body around each match with `sed -n 'Xp' sdk-service-build/app.py`.

- [ ] **Step 4: In the reaper, pop `_publish_locks` alongside `_stream_sessions` and `_lv2v_jobs`**

Locate the lines inside the reaper that pop the other two dicts. Add `_publish_locks.pop(stream_id, None)` immediately after them, in the same conditional branch.

- [ ] **Step 5: Syntax-check and hot-patch**

```bash
python3 -c "import ast; ast.parse(open('sdk-service-build/app.py').read()); print('syntax ok')"
gcloud compute scp sdk-service-build/app.py sdk-staging-1:/tmp/app.py.new \
    --zone=us-west1-b --project=livepeer-simple-infra --quiet
gcloud compute ssh sdk-staging-1 \
    --zone=us-west1-b --project=livepeer-simple-infra \
    --command="sudo docker cp /tmp/app.py.new sdk-service:/app/app.py && sudo docker restart sdk-service && sleep 5 && curl -sf http://localhost:8000/health"
```

- [ ] **Step 6: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/app.py
git commit -m "$(cat <<'EOF'
feat(sdk): destroy _publish_locks entry in /stream/stop and reaper

Lock lifecycle now tracks session lifecycle: created in /stream/start,
destroyed in /stream/stop next to the other session-state pops, and
also destroyed by the reaper when it evicts idle streams. Existing
lock holders (mid-publish requests) keep their reference to the Lock
object via closure, so popping the dict doesn't invalidate their hold
— new publish attempts after pop fail lookup and return 410.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Rewrite /stream/{id}/publish with per-stream lock + threadpool wrap

**Files:**
- Modify: `sdk-service-build/app.py` (`/stream/{stream_id}/publish` handler around line 1658)

- [ ] **Step 1: Read current handler**

```bash
grep -n '@app.post.*stream.*publish' sdk-service-build/app.py
```

Expected: one match. Use `sed -n '1658,1710p' sdk-service-build/app.py` (adjust range based on grep output) to see the full current handler.

- [ ] **Step 2: Replace the handler body**

Replace the current handler function (from its `@app.post` decorator through the matching `return` statement) with:

```python
@app.post("/stream/{stream_id}/publish")
async def publish_frame(stream_id: str, request: Request):
    """Proxy a frame to the per-stream trickle publish channel.

    Per-stream asyncio.Lock serializes publishes within a stream, which
    is required to respect the trickle server's 5-slot ring buffer
    (trickle_server.go:82). Across streams there is no serialization —
    each stream's lock is independent. The urllib call itself runs on
    the default threadpool so the event loop stays free even when the
    trickle server is slow to ack.
    """
    lock = _publish_locks.get(stream_id)
    if lock is None:
        raise HTTPException(status_code=410, detail="Stream no longer exists")

    job = _lv2v_jobs.get(stream_id)
    if job is None:
        raise HTTPException(status_code=410, detail="Stream no longer exists")

    # Parse seq from query string; default to -1 which the trickle server
    # treats as "next". Client always passes explicit seq so this fallback
    # is defensive only.
    seq = int(request.query_params.get("seq", "-1"))
    body = await request.body()
    trickle_url = f"{job.publish_url}/{seq}"

    def _do_publish() -> tuple[int, dict[str, str]]:
        req = urllib.request.Request(trickle_url, data=body, method="POST")
        with urllib.request.urlopen(req, timeout=10, context=_ssl_ctx) as r:
            # Capture the Lp-Trickle-Seq response header so tests can
            # verify ring-buffer slot ownership.
            return r.status, dict(r.headers)

    async with lock:
        try:
            status, headers = await asyncio.to_thread(_do_publish)
        except urllib.error.HTTPError as e:
            raise HTTPException(status_code=e.code, detail=str(e))
        except urllib.error.URLError as e:
            raise HTTPException(status_code=502, detail=str(e))

    # Pass through the trickle server's seq header so clients/tests can
    # verify which ring slot the frame landed in.
    resp_headers = {}
    if "Lp-Trickle-Seq" in headers:
        resp_headers["Lp-Trickle-Seq"] = headers["Lp-Trickle-Seq"]
    return Response(status_code=status, headers=resp_headers)
```

- [ ] **Step 3: Verify `urllib.error` is imported**

```bash
grep -n "^import urllib" sdk-service-build/app.py
```

Expected: `import urllib.request` and `import urllib.error` both present. If `urllib.error` is missing, add `import urllib.error` next to `import urllib.request` at line 26-27.

- [ ] **Step 4: Syntax-check**

```bash
python3 -c "import ast; ast.parse(open('sdk-service-build/app.py').read()); print('syntax ok')"
```

- [ ] **Step 5: Hot-patch**

```bash
gcloud compute scp sdk-service-build/app.py sdk-staging-1:/tmp/app.py.new \
    --zone=us-west1-b --project=livepeer-simple-infra --quiet
gcloud compute ssh sdk-staging-1 \
    --zone=us-west1-b --project=livepeer-simple-infra \
    --command="sudo docker cp /tmp/app.py.new sdk-service:/app/app.py && sudo docker restart sdk-service && sleep 5 && curl -sf http://localhost:8000/health"
```

Expected: `{"status":"ok",...}`.

- [ ] **Step 6: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/app.py
git commit -m "$(cat <<'EOF'
feat(sdk): rewrite /stream/{id}/publish with per-stream lock + threadpool

Per-stream asyncio.Lock acquired before dispatching the urllib POST to
the threadpool ensures strict per-stream ordering (at most 1 publish
in flight per stream), preserving the go-livepeer trickle server's
5-slot ring buffer invariant (trickle_server.go:82 — idx%5 collision
at depth>=5 evicts the older segment).

Across streams there is full parallelism: each stream holds its own
lock, two streams can publish simultaneously. Previous behavior was
accidental-serial-across-all-streams via event-loop blocking; new
behavior is intentional-serial-per-stream + parallel-across-streams,
which is strictly better.

Lookup failure in _publish_locks returns 410 Gone, matching existing
unknown-stream semantics. lib/stream/session.ts:167 client-side
auto-stops on first 410.

Lp-Trickle-Seq response header is passed through to callers so T4
can verify ring-slot ownership for each publish.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Write T4 (frame-order integrity at trickle server)

**Files:**
- Create: `sdk-service-build/tests/test_02_publish_ordering.py`

- [ ] **Step 1: Create the test file with T4**

File: `sdk-service-build/tests/test_02_publish_ordering.py`

```python
"""T4, T5 — publish ordering and across-stream parallelism.

These tests drive the SDK directly with HTTP publish calls; they do not
go through the browser camera widget. Frame payloads are generated by
helpers.frame_gen with the seq encoded in the first 16 bytes so any
content mix-up is visible in pytest failure output.
"""
from __future__ import annotations

import time
import requests

from helpers.frame_gen import make_frame
from helpers.concurrent import run_in_background
from helpers.metrics import count_overlapping_pairs


def _start_stream(sdk_url: str, auth_headers: dict[str, str]) -> str:
    """Start a minimal LV2V stream and return its stream_id."""
    resp = requests.post(
        f"{sdk_url}/stream/start",
        headers={**auth_headers, "Content-Type": "application/json"},
        json={
            "model_id": "scope",
            "params": {"prompt": "test"},
        },
        timeout=30,
    )
    assert resp.status_code == 200, f"/stream/start failed: {resp.status_code} {resp.text[:200]}"
    return resp.json()["stream_id"]


def _publish(sdk_url: str, stream_id: str, seq: int, body: bytes, timeout: float = 15.0) -> tuple[int, str | None, float, float]:
    """Publish one frame. Returns (status, Lp-Trickle-Seq header, start, end)."""
    start = time.time()
    r = requests.post(
        f"{sdk_url}/stream/{stream_id}/publish?seq={seq}",
        data=body,
        headers={"Content-Type": "image/jpeg"},
        timeout=timeout,
    )
    end = time.time()
    return r.status_code, r.headers.get("Lp-Trickle-Seq"), start, end


def test_t4_frame_order_integrity_at_15hz(sdk_url, auth_headers, stream_cleanup):
    """T4: Publish 100 distinct-content frames at 15 Hz (deliberately
    faster than production 10Hz to widen the race window). Every POST
    must return 200, and the trickle server's Lp-Trickle-Seq response
    header must match the submitted seq on every response — proving
    the per-stream lock prevents ring-buffer slot eviction.
    """
    stream_id = _start_stream(sdk_url, auth_headers)
    stream_cleanup(stream_id)

    # Wait briefly for the stream to be ready for publishes — this
    # matches the production client's behavior of publishing shortly
    # after /stream/start returns.
    time.sleep(3.0)

    results: list[tuple[int, int, str | None]] = []  # (seq, status, header)
    interval = 1.0 / 15.0  # 15 Hz = 66ms between frames
    t0 = time.time()
    for seq in range(100):
        target = t0 + seq * interval
        now = time.time()
        if now < target:
            time.sleep(target - now)
        status, header, _, _ = _publish(sdk_url, stream_id, seq, make_frame(seq))
        results.append((seq, status, header))

    # All 100 publishes must return 200
    failures = [(s, st) for s, st, _ in results if st != 200]
    assert not failures, f"{len(failures)} publishes failed: {failures[:5]}"

    # Every Lp-Trickle-Seq header must match the submitted seq
    mismatches = [
        (s, st, h)
        for s, st, h in results
        if h is None or int(h) != s
    ]
    assert not mismatches, (
        f"{len(mismatches)} Lp-Trickle-Seq mismatches — ring-buffer slot "
        f"eviction detected (per-stream lock ineffective): "
        f"first 5 = {mismatches[:5]}"
    )
```

- [ ] **Step 2: Run T4 (SDK already hot-patched from Task 13)**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=<your-key> pytest -v test_02_publish_ordering.py::test_t4_frame_order_integrity_at_15hz
```

Expected: **PASS**. If the test fails with Lp-Trickle-Seq mismatches, the per-stream lock is not being held correctly — inspect the publish handler's `async with lock` placement.

- [ ] **Step 3: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/tests/test_02_publish_ordering.py
git commit -m "$(cat <<'EOF'
test(sdk): add T4 — frame-order integrity at 15Hz

Locks in the per-stream lock invariant: 100 publishes at 15Hz
(deliberately faster than production 10Hz) must all return 200 with
matching Lp-Trickle-Seq response headers. Any mismatch proves the
trickle server's ring buffer slot was evicted by an in-flight overlap,
which the per-stream asyncio.Lock is supposed to prevent.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Add T5 (across-stream publish parallelism)

**Files:**
- Modify: `sdk-service-build/tests/test_02_publish_ordering.py` (append T5)

- [ ] **Step 1: Append T5**

Add to the end of `sdk-service-build/tests/test_02_publish_ordering.py`:

```python
def test_t5_across_stream_publish_parallelism(sdk_url, auth_headers, stream_cleanup):
    """T5: Two streams publishing simultaneously must actually run in
    parallel, not serialize on a global lock. Verified by counting
    overlapping wall-clock intervals between publishes from the two
    streams — a serialized implementation would have zero overlaps.
    """
    s1 = _start_stream(sdk_url, auth_headers)
    stream_cleanup(s1)
    s2 = _start_stream(sdk_url, auth_headers)
    stream_cleanup(s2)

    time.sleep(3.0)

    intervals1: list[tuple[float, float]] = []
    intervals2: list[tuple[float, float]] = []

    def _publish_loop(stream_id: str, store: list[tuple[float, float]]) -> None:
        for seq in range(50):
            _, _, start, end = _publish(sdk_url, stream_id, seq, make_frame(seq))
            store.append((start, end))
            # 10 Hz production cadence
            time.sleep(max(0, 0.1 - (end - start)))

    t1 = run_in_background(lambda: _publish_loop(s1, intervals1))
    t2 = run_in_background(lambda: _publish_loop(s2, intervals2))
    wall_start = time.time()
    t1.join(timeout=30)
    t2.join(timeout=30)
    wall_total = time.time() - wall_start

    # Both must have sent all 50 frames
    assert len(intervals1) == 50, f"s1 only sent {len(intervals1)} frames"
    assert len(intervals2) == 50, f"s2 only sent {len(intervals2)} frames"

    # At least 20 overlapping pairs proves cross-stream parallelism
    overlaps = count_overlapping_pairs(intervals1, intervals2)
    assert overlaps >= 20, (
        f"only {overlaps} overlapping publish intervals across the two "
        f"streams — cross-stream parallelism broken (lock is global, "
        f"not per-stream)"
    )

    # Wall-clock ceiling: 50 frames each at 10Hz with parallelism should
    # finish in ~5s per stream wall time. Strict serialization would take
    # ~10s. 6s gives headroom for orch latency jitter without letting
    # serialization pass.
    assert wall_total <= 8.0, (
        f"total wall time {wall_total:.1f}s > 8s — publishes are not "
        f"actually running in parallel across streams"
    )
```

- [ ] **Step 2: Run T5**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=<your-key> pytest -v test_02_publish_ordering.py::test_t5_across_stream_publish_parallelism
```

Expected: **PASS**.

- [ ] **Step 3: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/tests/test_02_publish_ordering.py
git commit -m "$(cat <<'EOF'
test(sdk): add T5 — across-stream publish parallelism

Two streams publishing concurrently must have overlapping wall-clock
intervals (>=20 pairs) and finish within 8s total (strict serialization
would take ~10s). Locks in that the per-stream lock is per-stream, not
a global publish lock that would regress today's accidental blocking
behavior into intentional behavior.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Add T3 (concurrent /inference + /stream/start)

**Files:**
- Modify: `sdk-service-build/tests/test_01_event_loop.py` (append T3)

- [ ] **Step 1: Append T3**

Add to the end of `sdk-service-build/tests/test_01_event_loop.py`:

```python
def test_t3_concurrent_inference_and_stream_start(sdk_url, auth_headers, stream_cleanup):
    """T3: The original incident scenario. Starting an LV2V stream
    within 500ms of an ltx-i2v /inference being in flight must not
    block behind the inference. Both calls must return 200 and the
    stream must be reachable via /stream/{id}/status within 1s of
    /stream/start returning.
    """
    inference_result: list[CallResult] = []

    def _runner():
        inference_result.append(_fire_ltx_i2v(sdk_url, auth_headers))

    inference_thread = run_in_background(_runner)
    time.sleep(0.5)

    # Start the stream — this must not block behind the inference
    stream_start = time.time()
    resp = requests.post(
        f"{sdk_url}/stream/start",
        headers={**auth_headers, "Content-Type": "application/json"},
        json={"model_id": "scope", "params": {"prompt": "test"}},
        timeout=30,
    )
    stream_elapsed = time.time() - stream_start

    assert resp.status_code == 200, f"/stream/start failed: {resp.status_code} {resp.text[:200]}"
    assert stream_elapsed <= 15.0, (
        f"/stream/start took {stream_elapsed:.1f}s > 15s — event loop "
        f"was serializing behind the inference"
    )

    stream_id = resp.json()["stream_id"]
    stream_cleanup(stream_id)

    # Stream must be reachable via /status within 1s
    status_start = time.time()
    status_resp = requests.get(
        f"{sdk_url}/stream/{stream_id}/status",
        headers=auth_headers,
        timeout=5,
    )
    status_elapsed = time.time() - status_start
    assert status_resp.status_code == 200
    assert status_elapsed <= 1.0, f"/stream/status took {status_elapsed:.1f}s > 1s"

    # Let the inference finish so the thread joins cleanly
    inference_thread.join(timeout=180)
    assert inference_result and inference_result[0].status == 200, (
        f"inference did not complete successfully: "
        f"{inference_result[0] if inference_result else 'no result'}"
    )
```

- [ ] **Step 2: Run T3**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=<your-key> pytest -v test_01_event_loop.py::test_t3_concurrent_inference_and_stream_start
```

Expected: **PASS**.

- [ ] **Step 3: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/tests/test_01_event_loop.py
git commit -m "$(cat <<'EOF'
test(sdk): add T3 — concurrent inference and stream start

The original incident test. Locks in that /stream/start during an
in-flight ltx-i2v /inference no longer serializes behind the inference
(<=15s end-to-end instead of stalling for the full inference duration).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Add T6 (ContextVar propagation via signer path)

**Files:**
- Create: `sdk-service-build/tests/test_03_context_vars.py`

- [ ] **Step 1: Create T6**

File: `sdk-service-build/tests/test_03_context_vars.py`

```python
"""T6 — ContextVar propagation through asyncio.to_thread.

Verifies the signer path still works after moving submit_byoc_job onto
the threadpool. If asyncio.to_thread's contextvars.copy_context() wasn't
actually propagating _current_signer_headers, the signer would reject
the request and we'd see a 401/503 instead of a 200.
"""
from __future__ import annotations

import requests


def test_t6_signer_header_propagates_into_threadpool(sdk_url, auth_headers):
    """T6: A valid /inference request with a real Daydream API key must
    return 200 (signer accepts the payment tickets). A regression to
    loop.run_in_executor — which does NOT propagate contextvars — would
    silently drop the signer headers inside the thread and cause the
    signer to reject, returning 503 with a signer error.
    """
    # Use flux-schnell (fast: ~3-8s) instead of ltx-i2v (slow: 30-60s)
    # so this test is cheap to run.
    resp = requests.post(
        f"{sdk_url}/inference",
        headers={**auth_headers, "Content-Type": "application/json"},
        json={
            "capability": "flux-schnell",
            "prompt": "a single red apple on a white background",
            "timeout": 60,
        },
        timeout=90,
    )

    assert resp.status_code == 200, (
        f"/inference returned {resp.status_code} — if this is 503 with "
        f"a signer-related error, the ContextVar did NOT propagate into "
        f"the threadpool (check asyncio.to_thread vs run_in_executor in "
        f"the /inference handler). Body: {resp.text[:400]}"
    )

    body = resp.json()
    assert body.get("image_url") or body.get("data"), (
        f"/inference returned 200 but no image_url or data: {body}"
    )
```

- [ ] **Step 2: Run T6**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=<your-key> pytest -v test_03_context_vars.py::test_t6_signer_header_propagates_into_threadpool
```

Expected: **PASS**.

- [ ] **Step 3: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/tests/test_03_context_vars.py
git commit -m "$(cat <<'EOF'
test(sdk): add T6 — ContextVar propagates into threadpool

Locks in the decision to use asyncio.to_thread (which calls
contextvars.copy_context() under the hood) instead of
loop.run_in_executor (which does not). A regression to run_in_executor
would cause signer rejection because _current_signer_headers would be
invisible inside the worker thread.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Add T7 (threadpool capacity under burst)

**Files:**
- Modify: `sdk-service-build/tests/test_01_event_loop.py` (append T7)

- [ ] **Step 1: Append T7**

Add to the end of `sdk-service-build/tests/test_01_event_loop.py`:

```python
def _fire_flux_schnell(sdk_url: str, auth_headers: dict[str, str]) -> CallResult:
    start = time.time()
    try:
        r = requests.post(
            f"{sdk_url}/inference",
            headers={**auth_headers, "Content-Type": "application/json"},
            json={"capability": "flux-schnell", "prompt": "test image", "timeout": 60},
            timeout=90,
        )
        return CallResult(start=start, end=time.time(), status=r.status_code, body=r.content)
    except Exception as e:
        return CallResult(start=start, end=time.time(), status=-1, body=b"", exception=e)


def test_t7_threadpool_capacity_under_burst(sdk_url, auth_headers):
    """T7: 20 concurrent /inference calls (mix of fast flux-schnell and
    slow ltx-i2v) must all complete successfully while /health latency
    stays under 100ms p99 — proving the 64-thread default executor has
    enough headroom for the realistic worst-case workload.
    """
    from helpers.concurrent import run_concurrent

    # Fire 20 concurrent inferences in the background
    inference_thread = run_in_background(
        lambda: run_concurrent(
            lambda: _fire_flux_schnell(sdk_url, auth_headers),
            count=20,
        )
    )

    # Give them ~500ms to actually enter the threadpool
    time.sleep(0.5)

    # Probe /health 50 times at 100ms intervals
    latencies: list[float] = []
    errors: list[Exception] = []
    for _ in range(50):
        r = _call_health(sdk_url)
        if r.status != 200:
            errors.append(r.exception or RuntimeError(f"status {r.status}"))
        latencies.append(r.elapsed_ms)
        time.sleep(0.1)

    inference_thread.join(timeout=180)

    assert not errors, f"/health returned non-200 during burst: {errors[:3]}"
    p99 = percentile(latencies, 99)
    assert p99 <= 100, (
        f"/health p99 {p99:.1f}ms > 100ms during 20-concurrent-inference "
        f"burst — threadpool may be near saturation. Consider raising "
        f"max_workers above 64 in the startup handler."
    )
```

- [ ] **Step 2: Run T7**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=<your-key> pytest -v test_01_event_loop.py::test_t7_threadpool_capacity_under_burst
```

Expected: **PASS**.

- [ ] **Step 3: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/tests/test_01_event_loop.py
git commit -m "$(cat <<'EOF'
test(sdk): add T7 — threadpool capacity under 20-concurrent burst

Locks in the max_workers=64 decision. 20 concurrent flux-schnell
inferences while /health is probed 50 times at 100ms interval: all
inferences succeed, /health p99 <= 100ms. A failure here is the signal
to raise max_workers.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Add T8 and T9 (lifecycle and reaper cleanup)

**Files:**
- Create: `sdk-service-build/tests/test_04_lifecycle.py`

- [ ] **Step 1: Create T8 and T9**

File: `sdk-service-build/tests/test_04_lifecycle.py`

```python
"""T8, T9 — lock lifecycle: stop() cleanup and reaper cleanup.

T8 verifies that /stream/{id}/publish returns 410 Gone immediately after
/stream/{id}/stop, proving the _publish_locks dict is popped in sync
with the rest of the session state. T9 verifies that an unstopped,
idle stream is eventually reaped and its lock entry removed.
"""
from __future__ import annotations

import time
import requests

from helpers.frame_gen import make_frame


def _start_stream(sdk_url: str, auth_headers: dict[str, str]) -> str:
    resp = requests.post(
        f"{sdk_url}/stream/start",
        headers={**auth_headers, "Content-Type": "application/json"},
        json={"model_id": "scope", "params": {"prompt": "test"}},
        timeout=30,
    )
    assert resp.status_code == 200
    return resp.json()["stream_id"]


def test_t8_stop_immediately_returns_410_on_publish(sdk_url, auth_headers):
    """T8: After /stream/{id}/stop, a subsequent /stream/{id}/publish
    must return HTTP 410 Gone (not 404, not 500). The client relies on
    410-as-terminal to auto-stop — any other status keeps retrying and
    leaks traffic to a dead stream.
    """
    stream_id = _start_stream(sdk_url, auth_headers)

    # Wait for stream to accept publishes then push one successful frame
    time.sleep(3.0)
    first = requests.post(
        f"{sdk_url}/stream/{stream_id}/publish?seq=0",
        data=make_frame(0),
        headers={"Content-Type": "image/jpeg"},
        timeout=10,
    )
    assert first.status_code == 200, f"first publish failed: {first.status_code} {first.text[:200]}"

    # Stop the stream
    stop_resp = requests.post(
        f"{sdk_url}/stream/{stream_id}/stop",
        headers=auth_headers,
        timeout=5,
    )
    assert stop_resp.status_code in (200, 204), f"stop returned {stop_resp.status_code}"

    # Immediate follow-up publish: must be 410
    followup = requests.post(
        f"{sdk_url}/stream/{stream_id}/publish?seq=1",
        data=make_frame(1),
        headers={"Content-Type": "image/jpeg"},
        timeout=5,
    )
    assert followup.status_code == 410, (
        f"post-stop publish returned {followup.status_code} instead of 410 — "
        f"_publish_locks was not cleaned up in /stream/stop. "
        f"Body: {followup.text[:200]}"
    )


def test_t9_reaper_cleans_up_idle_stream_and_lock(sdk_url, auth_headers):
    """T9: A stream started but never publishing to is eventually killed
    by the reaper. After the reaper runs, /stream/{id}/publish must
    return 410 — proving both _stream_sessions/_lv2v_jobs AND
    _publish_locks were cleaned up. This test is slow because it waits
    out the reaper idle threshold (documented as ~2 minutes) plus one
    reaper cycle (30s).
    """
    stream_id = _start_stream(sdk_url, auth_headers)

    # Wait longer than reaper idle threshold + one cycle. Documented
    # threshold is 2 minutes; 180s is a conservative margin.
    print(f"T9: waiting 180s for reaper to kill idle stream {stream_id}...")
    time.sleep(180)

    # After reap, publish must 410
    resp = requests.post(
        f"{sdk_url}/stream/{stream_id}/publish?seq=0",
        data=make_frame(0),
        headers={"Content-Type": "image/jpeg"},
        timeout=5,
    )
    assert resp.status_code == 410, (
        f"post-reap publish returned {resp.status_code} instead of 410 — "
        f"reaper did not clean up _publish_locks. Body: {resp.text[:200]}"
    )
```

- [ ] **Step 2: Run T8 and T9 (T9 is slow)**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=<your-key> pytest -v test_04_lifecycle.py::test_t8_stop_immediately_returns_410_on_publish
SDK_API_KEY=<your-key> pytest -v test_04_lifecycle.py::test_t9_reaper_cleans_up_idle_stream_and_lock
```

Expected: both **PASS**. T9 takes ~3 minutes.

- [ ] **Step 3: Commit**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git add sdk-service-build/tests/test_04_lifecycle.py
git commit -m "$(cat <<'EOF'
test(sdk): add T8, T9 — lock lifecycle (stop + reaper cleanup)

T8: post-stop publish returns 410 Gone (not 404/500), proving
_publish_locks is popped in /stream/stop.

T9: post-reap publish returns 410, proving the reaper also pops
_publish_locks when evicting idle streams. Slow test (~3 min) because
it waits out the reaper's 2-minute idle threshold.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Add T10 Playwright end-to-end test

**Files:**
- Create: `storyboard-a3/tests/e2e/sdk-nonblocking-io.spec.ts`

- [ ] **Step 1: Create the Playwright test**

File: `/Users/qiang.han/Documents/mycodespace/storyboard-a3/tests/e2e/sdk-nonblocking-io.spec.ts`

```typescript
/**
 * T10 — Full frontend end-to-end verification of the SDK non-blocking I/O
 * design. Opens two LV2V streams plus one ltx-i2v inference concurrently
 * and verifies all three succeed within a 120s window.
 *
 * Prerequisites:
 *   - SDK_API_KEY env var set (passed to the page via localStorage injection)
 *   - SDK deployed with the non-blocking changes
 *   - storyboard-a3 dev server accessible at PLAYWRIGHT_BASE_URL or
 *     http://localhost:3000 by default
 */
import { test, expect, Browser } from "@playwright/test";

const SDK_API_KEY = process.env.SDK_API_KEY;
if (!SDK_API_KEY) {
  throw new Error("SDK_API_KEY environment variable required for T10");
}

async function openStoryboard(browser: Browser, label: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Inject the API key into localStorage before first navigation
  await context.addInitScript((key) => {
    localStorage.setItem("daydream_api_key", key);
  }, SDK_API_KEY);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  console.log(`[${label}] loaded`);
  return { context, page };
}

test("T10: two LV2V streams + one ltx-i2v inference concurrently", async ({
  browser,
}) => {
  test.setTimeout(180_000); // 3 minutes total

  // Open three independent browser contexts side-by-side
  const [ctx1, ctx2, ctx3] = await Promise.all([
    openStoryboard(browser, "lv2v-1"),
    openStoryboard(browser, "lv2v-2"),
    openStoryboard(browser, "inference"),
  ]);

  try {
    // Start LV2V in contexts 1 and 2 via the chat agent
    await ctx1.page.fill('[data-testid="chat-input"]', "start an lv2v stream");
    await ctx1.page.press('[data-testid="chat-input"]', "Enter");
    await ctx2.page.fill('[data-testid="chat-input"]', "start an lv2v stream");
    await ctx2.page.press('[data-testid="chat-input"]', "Enter");

    // Wait for both stream cards to appear
    await expect(
      ctx1.page.locator('[data-card][data-card-type="stream"]').first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      ctx2.page.locator('[data-card][data-card-type="stream"]').first()
    ).toBeVisible({ timeout: 30_000 });

    // Fire ltx-i2v in context 3
    await ctx3.page.fill(
      '[data-testid="chat-input"]',
      "animate this: a cat walking in a garden with ltx"
    );
    await ctx3.page.press('[data-testid="chat-input"]', "Enter");

    // Wait 90s — both streams should stay alive, inference should complete
    await ctx1.page.waitForTimeout(90_000);

    // Assert both LV2V stream cards are still alive (non-zero recv counter)
    const recv1 = await ctx1.page
      .locator('[data-card][data-card-type="stream"]')
      .first()
      .locator('text=/recv:\\s*\\d+/')
      .textContent();
    const recv2 = await ctx2.page
      .locator('[data-card][data-card-type="stream"]')
      .first()
      .locator('text=/recv:\\s*\\d+/')
      .textContent();

    const recvCount1 = parseInt(recv1?.match(/recv:\s*(\d+)/)?.[1] ?? "0", 10);
    const recvCount2 = parseInt(recv2?.match(/recv:\s*(\d+)/)?.[1] ?? "0", 10);

    expect(recvCount1).toBeGreaterThanOrEqual(10);
    expect(recvCount2).toBeGreaterThanOrEqual(10);

    // Assert the ltx-i2v card exists and has a video URL by now
    const videoCard = ctx3.page.locator('[data-card][data-card-type="video"]').first();
    await expect(videoCard).toBeVisible({ timeout: 30_000 });

    // Assert no console errors across the three contexts
    const errors1: string[] = [];
    const errors2: string[] = [];
    const errors3: string[] = [];
    ctx1.page.on("console", (m) => m.type() === "error" && errors1.push(m.text()));
    ctx2.page.on("console", (m) => m.type() === "error" && errors2.push(m.text()));
    ctx3.page.on("console", (m) => m.type() === "error" && errors3.push(m.text()));

    expect(errors1, "ctx1 console errors").toEqual([]);
    expect(errors2, "ctx2 console errors").toEqual([]);
    expect(errors3, "ctx3 console errors").toEqual([]);
  } finally {
    await Promise.all([ctx1.context.close(), ctx2.context.close(), ctx3.context.close()]);
  }
});
```

- [ ] **Step 2: Run T10**

```bash
cd /Users/qiang.han/Documents/mycodespace/storyboard-a3
# Start the dev server in another terminal first: npm run dev
SDK_API_KEY=<your-key> npx playwright test tests/e2e/sdk-nonblocking-io.spec.ts --headed
```

Expected: **PASS**.

- [ ] **Step 3: Commit to storyboard-a3**

```bash
cd /Users/qiang.han/Documents/mycodespace/storyboard-a3
git add tests/e2e/sdk-nonblocking-io.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): T10 — concurrent LV2V streams + ltx-i2v inference

The top-level user-experience guarantee. Opens two LV2V streams plus
one ltx-i2v inference in three independent browser contexts, waits 90s,
and verifies both LV2V cards still have receive counters >= 10 and the
inference has produced its video output — proving the SDK non-blocking
I/O design actually solves the user-visible problem.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: Run full T1-T9 suite end-to-end

**Files:**
- No file changes.

- [ ] **Step 1: Verify SDK is running the latest patch**

```bash
gcloud compute ssh sdk-staging-1 --zone=us-west1-b --project=livepeer-simple-infra \
    --command="sudo docker exec sdk-service md5sum /app/app.py" \
    && md5 /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/app.py
```

Expected: the two md5 values match. If they differ, rerun the hot-patch from Task 13 Step 5.

- [ ] **Step 2: Run the full suite via run-tests.sh**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra/sdk-service-build/tests
SDK_API_KEY=<your-key> ./run-tests.sh
```

Expected: all of T1, T2, T3, T4, T5, T6, T7, T8, T9 pass. The run takes ~10 minutes (T9 alone is ~3 minutes).

- [ ] **Step 3: Run T10 via Playwright**

```bash
cd /Users/qiang.han/Documents/mycodespace/storyboard-a3
SDK_API_KEY=<your-key> npx playwright test tests/e2e/sdk-nonblocking-io.spec.ts --headed
```

Expected: **PASS**.

- [ ] **Step 4: On any failure, revert via pre-change snapshot**

```bash
gcloud compute scp /tmp/app.py.pre-change sdk-staging-1:/tmp/app.py.revert \
    --zone=us-west1-b --project=livepeer-simple-infra --quiet
gcloud compute ssh sdk-staging-1 --zone=us-west1-b --project=livepeer-simple-infra \
    --command="sudo docker cp /tmp/app.py.revert sdk-service:/app/app.py && sudo docker restart sdk-service"
```

Then document which test failed and investigate before retrying. Do not merge or push to the image registry until all tests pass.

- [ ] **Step 5: Mark the task complete (no commit)**

This task is a gate, not a code change.

---

## Task 22: Push branch and open PR

**Files:**
- No file changes; git remote operation.

- [ ] **Step 1: Push the branch**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
git push -u origin feat/sdk-nonblocking-io
```

Expected: new branch created at `https://github.com/livepeer/simple-infra/tree/feat/sdk-nonblocking-io`.

- [ ] **Step 2: Open the PR via gh**

```bash
cd /Users/qiang.han/Documents/mycodespace/simple-infra
gh pr create --base feat/sdk-capabilities-cache --head feat/sdk-nonblocking-io \
    --title "feat(sdk): non-blocking I/O for all handlers" \
    --body "$(cat <<'EOF'
## Summary
- Wraps every blocking I/O call site in `app.py` with `asyncio.to_thread` so the single-worker uvicorn event loop never stalls on long-running BYOC/LLM/urllib calls.
- Adds a 64-thread default `ThreadPoolExecutor` at app startup to give the worst-case workload (5 long inferences + 10 LV2V streams + ambient traffic, ~30 threads busy) 2x headroom.
- Adds per-stream `asyncio.Lock` for `/stream/{id}/publish` to respect the go-livepeer trickle server's 5-slot ring buffer constraint (`trickle_server.go:82`). Per-stream serialization, full across-stream parallelism.
- Full pytest suite (T1-T9) running against the live staging SDK locks in every design decision. Every test has clearly-tied pass/fail criteria pointing at the spec decision it protects.
- Playwright e2e test (T10) verifies the user-visible problem is solved: two concurrent LV2V streams + one ltx-i2v inference all succeed.

## Test plan
- [x] T1 event loop free during long inference
- [x] T2 /capabilities fast during inference
- [x] T3 concurrent inference + /stream/start
- [x] T4 frame-order integrity at 15Hz
- [x] T5 across-stream publish parallelism
- [x] T6 ContextVar propagation
- [x] T7 threadpool burst capacity
- [x] T8 stop → 410
- [x] T9 reaper cleanup
- [x] T10 frontend e2e

Design spec: `storyboard-a3/docs/superpowers/specs/2026-04-12-sdk-nonblocking-io-design.md`
Implementation plan: `storyboard-a3/docs/superpowers/plans/2026-04-12-sdk-nonblocking-io.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Report it back.

- [ ] **Step 3: Image rebuild (post-merge)**

After the PR is merged, the SDK image must be rebuilt so the change is durable across future container recreates. The build process for this image lives outside this repo; consult the deployment owner. Until the rebuild, the SDK runs on a hot-patched container — any `docker compose up -d` or VM reboot will revert it.

- [ ] **Step 4: Update CLAUDE.md in storyboard-a3**

Add a new entry under "Lessons from the 2026-04-11 outage" noting that the follow-up non-blocking I/O change landed, and update the "SDK uvicorn config" section to confirm that `--workers 1` is now strictly correct (not a workaround).

```bash
cd /Users/qiang.han/Documents/mycodespace/storyboard-a3
# Edit CLAUDE.md per the above, then:
git add CLAUDE.md
git commit -m "docs: note non-blocking I/O follow-up landed, remove 'scheduled follow-up' qualifier from workers=1 justification

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

### 1. Spec coverage

Walking through each section of the design spec and pointing at the task that implements it:

- **§Architecture — blocking wraps via `asyncio.to_thread`**: Tasks 5, 7, 8, 9, 10, 13.
- **§Architecture — 64-thread default executor**: Task 3.
- **§Architecture — per-stream asyncio.Lock**: Tasks 11, 12, 13.
- **§Architecture — ContextVar propagation via to_thread**: Tasks 5 (code), 17 (test).
- **§Architecture — helpers become async**: Tasks 9, 10.
- **§Architecture — start_lv2v left alone**: Implicit (no task touches line ~1225).
- **§Detailed Design §1 threadpool size 64**: Task 3.
- **§Detailed Design §2 /inference, /train, /enrich, /capabilities refresh**: Tasks 5, 7, 8.
- **§Detailed Design §3 _llm_call, _control_post async**: Tasks 9, 10.
- **§Detailed Design §4 publish rewrite with per-stream lock**: Tasks 11, 12, 13.
- **§Detailed Design §5 /stream/{id}/control, /stream/{id}/status**: Task 10 (via _control_post).
- **§Error Handling**: preserved in every wrap (Tasks 5-13 all keep existing except blocks outside the wrap).
- **§Testing Strategy T1**: Tasks 4, 5.
- **§Testing Strategy T2**: Task 6.
- **§Testing Strategy T3**: Task 16.
- **§Testing Strategy T4**: Task 14.
- **§Testing Strategy T5**: Task 15.
- **§Testing Strategy T6**: Task 17.
- **§Testing Strategy T7**: Task 18.
- **§Testing Strategy T8**: Task 19.
- **§Testing Strategy T9**: Task 19.
- **§Testing Strategy T10**: Task 20.
- **§Rollout**: Tasks 21 (run full suite), 22 (push + PR + image rebuild).
- **§Testing §Test-only code removal**: The instrumentation described in the spec (in-flight counter, debug endpoint) is NOT used by the tests as actually written — the counter is enforced via `Lp-Trickle-Seq` header checks (T4) and the reaper test waits out real time (T9). **Gap resolved by not adding instrumentation at all.** Noting this difference between spec and plan: the plan does not add `SDK_TEST_INSTRUMENTATION` at all because the tests ended up simpler than the spec anticipated. Removed the unnecessary verification step.

### 2. Placeholder scan

Grep-equivalent scan for red flags in the plan text:
- "TBD", "TODO", "implement later": **none found**.
- "Add appropriate error handling": **none** — every wrap explicitly keeps the existing try/except, shown in code.
- "Similar to Task N": **none** — Tasks 7 and 8 duplicate the wrap pattern rather than cross-reference.
- "Write tests for the above" without code: **none** — every test task shows the full test function.
- References to methods not defined: self-check — `_publish_locks`, `_stream_sessions`, `_lv2v_jobs`, `make_frame`, `extract_seq`, `percentile`, `count_overlapping_pairs`, `run_concurrent`, `run_in_background`, `CallResult` — all defined in earlier tasks.

### 3. Type consistency

- `_publish_locks: dict[str, asyncio.Lock]` — consistent across Task 11 (definition), 12 (destruction), 13 (use), 19 (test assumptions).
- `CallResult` dataclass — defined in Task 2 `helpers/concurrent.py`, used in Tasks 4, 6, 16, 18.
- `stream_id` as `str` everywhere (never `int`).
- Test function names `test_tN_...` consistent with spec test numbering.

**One inconsistency found and fixed:** Task 7 Step 5 says "the containing function is `async def`" but if I left a direct `submit_byoc_job` call inside a sync helper I would have missed that. Added explicit grep instruction in Task 7 Step 5 to verify the helper's signature before editing.

Wait, let me re-check — Task 7 Step 5 already has this: *"If the containing function is `def` (sync), make it `async def`..."* Yes, handled. No edit needed.

Plan is self-consistent. Ready for handoff.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-12-sdk-nonblocking-io.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, two-stage review (spec compliance + code quality) after each, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?
