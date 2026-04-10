# Key Insights: Scope LV2V Integration

Hard-won lessons from debugging LV2V streaming between Storyboard → SDK → Orchestrator → fal runner.

## The 4 Fixes That Make LV2V Work

All four are required. Missing any one breaks the stream.

### 1. Orch: `-liveOutSegmentTimeout 300s`

**Symptom:** Stream dies at exactly 30 seconds. Fal logs show pipeline producing frames, then "WebSocket client disconnected".

**Root cause:** go-livepeer's `ai_live_video.go:256` has a 30s default output segment watchdog. If the orch doesn't see output segments within 30s, it kills the stream.

**Fix:** Add `-liveOutSegmentTimeout 300s` flag to orch startup command.

**Where:** `gcloud compute ssh orch-staging-1` → update docker run args.

**Verify:** Stream survives >30s. Check orch logs for "timeout waiting for segments" — should NOT appear.

### 2. Fal Runner: Application-Layer Ping/Pong (PR 864)

**Symptom:** Stream dies after ~20-30s even with timeout flag. Fal logs show "Livepeer fal ws client disconnected".

**Root cause:** The fal runner's WebSocket proxy didn't forward ping/pong frames. The orch sends pings via the control channel, but the fal app didn't respond with pongs. Without pong, the orch considers the connection dead.

**Fix:** PR 864 adds `ping` → `pong` response in the fal app's websocket handler:
```python
elif msg_type == "ping":
    await ws.send_json({"type": "pong", "request_id": ..., "timestamp": ...})
```

**Where:** Deployed as `daydream/scope-livepeer/ws` (production fal endpoint).

**Verify:** Orch logs show "Received Ping request" and no "websocket read ended" errors.

### 3. SDK: Graph Params in `start_stream`

**Symptom:** Publish returns 404 "Stream not found" on every frame. SDK logs show "Trickle publisher channel does not exist".

**Root cause:** The fal runner only creates per-stream input trickle channels when `start_stream` params include a graph with source nodes. Without the graph, `start_stream` response only returns output channels. The SDK falls back to the job-level publish URL which doesn't work.

**Fix:** Include a Scope-format linear graph in `start_stream` params:
```python
start_stream_params = {
    "pipeline_ids": [LV2V_PIPELINE],
    "prompts": prompt,
    "graph": {
        "nodes": [
            {"id": "input", "type": "source", "source_mode": "video"},
            {"id": LV2V_PIPELINE, "type": "pipeline", "pipeline_id": LV2V_PIPELINE},
            {"id": "output", "type": "sink"},
        ],
        "edges": [
            {"from": "input", "from_port": "video", "to_node": LV2V_PIPELINE, "to_port": "video", "kind": "stream"},
            {"from": LV2V_PIPELINE, "from_port": "video", "to_node": "output", "to_port": "video", "kind": "stream"},
        ],
    },
}
```

**Where:** `simple-infra/sdk-service-build/app.py` → `_init_stream_session()` → step 4.

**Verify:** SDK logs show "start_stream returned 2 channels" with both `in` and `out` URLs.

### 4. SDK: Correct Graph Edge Format

**Symptom:** Publish succeeds (200 OK) but `frames_out=0` — pipeline receives input but produces no output.

**Root cause:** Graph edges used `source`/`target` format but Scope uses `from`/`from_port`/`to_node`/`to_port`/`kind`. The fal runner silently ignores edges it can't parse, so the pipeline has no wiring between nodes.

**Fix:** Use exact Scope edge format:
```
WRONG: {"source": "input", "target": "pipeline"}
RIGHT: {"from": "input", "from_port": "video", "to_node": "pipeline", "to_port": "video", "kind": "stream"}
```

**Where:** Same location as fix #3.

**Verify:** SDK logs show `frames_out > 0`. Client receives output frames.

---

## The Full Working Sequence

This is the exact sequence the SDK must follow, matching Scope's `LivepeerClient`:

```
1. start_lv2v(orch_urls, params with daydream_user_id)
   → Creates job on orch, gets job-level trickle URLs
   → Returns: publish_url, subscribe_url, control_url, events_url

2. Start background loops (concurrent):
   - events_loop: read from events_url via JSONLReader
   - ping_loop: send {"type": "ping"} every 10s via control_url
   - payment_loop: send_payment() every 10s

3. Wait for runner_ready (from events channel, up to 120s)
   - Fal machine cold start: 2-5 minutes
   - Warm start: <1s

4. Send load_pipeline API request via control channel
   - {"type": "api", "method": "POST", "path": "/api/v1/pipeline/load", "body": {"pipeline_ids": ["longlive"]}}

5. Wait for pipeline_loaded (from log events, up to 300s)

6. Send start_stream with graph params via control channel
   - MUST include graph with source/pipeline/sink nodes
   - MUST use from/from_port/to_node/to_port/kind edge format
   - MUST include pipeline_ids and prompts

7. Wait for stream_started response (up to 120s)
   - Response includes per-stream channel URLs
   - Input: {id}-1-in (track index from source node)
   - Output: {id}-2-out (track index from sink node)

8. Create MediaPublish on per-stream INPUT URL ({id}-1-in)
   - NEVER use job-level URL ({id}) — returns 404
   - If no input channel returned, derive from output: replace "-out" with "-in"

9. Create MediaOutput on per-stream OUTPUT URL ({id}-2-out)
   - Start _output_decode_loop to decode MPEG-TS → JPEG

10. Set session phase to "ready"
    - Browser can now publish frames and poll output
```

---

## Diagnostic Checklist

When LV2V breaks, check in this order:

### Stream won't start (503)
- [ ] Daydream API key present in Authorization header?
- [ ] `daydream_user_id` resolved from API key? (SDK log: "Resolved daydream_user_id=...")
- [ ] Orch reachable? (`curl -sk https://orch-staging-1.daydream.monster:8935`)
- [ ] Fal machine has capacity? (orch log: "GetLiveAICapacity ... idleCapacity=N")
- [ ] FAL_API_KEY set on orch? (`docker exec orch env | grep FAL`)

### Stream starts but dies quickly (<30s)
- [ ] `-liveOutSegmentTimeout 300s` on orch?
- [ ] PR 864 fal app deployed? (ping/pong keepalive)
- [ ] Payment loop running? (SDK log: "payment sent" every 10s)
- [ ] Zombie streams consuming capacity? (`curl sdk.daydream.monster/streams`)

### Publish fails (404 on /stream/{id}/publish)
- [ ] Graph included in start_stream params?
- [ ] start_stream returned INPUT channel? (SDK log: "start_stream returned 2 channels")
- [ ] MediaPublish on per-stream URL ({id}-1-in), NOT job-level ({id})?
- [ ] SDK log: "media proxy initialized (in=...{id}-1-in, out=...{id}-2-out)"

### Publish works but no output (frames_out=0)
- [ ] Graph edge format correct? (from/from_port/to_node/to_port/kind)
- [ ] Pipeline node ID matches pipeline_id? (e.g., "longlive")
- [ ] MediaOutput subscribed to correct URL ({id}-2-out)?
- [ ] Fal runner processing? (fal log: "[FRAME-PROCESSOR] Frames: in=N, out=M")

### Output frames but browser shows black
- [ ] Stream card renders as `<img>` not `<video>`? (LV2V frames are JPEG, not video stream)
- [ ] Browser poll getting 200? (console: "[LV2V] Frame #1 received")
- [ ] `session.onFrame` wired to `updateCard`?

---

## Key URLs and Trickle Channel Naming

```
Job-level (created by start_lv2v):
  {id}          — job publish (DON'T USE for MediaPublish)
  {id}-out      — job subscribe (DON'T USE for MediaOutput)
  {id}-control  — control channel (JSONLWriter)
  {id}-events   — events channel (JSONLReader)

Per-stream (created by start_stream with graph):
  {id}-1-in     — per-stream input (USE for MediaPublish)
  {id}-2-out    — per-stream output (USE for MediaOutput)

Track indices:
  1 = input track (from source node)
  2 = output track (from sink node)
  These come from the graph node order, not hardcoded.
```

---

## Infrastructure Quick Reference

```bash
# Check orch
gcloud compute ssh orch-staging-1 --zone=us-west1-b --project=livepeer-simple-infra
sudo docker logs orch --tail 20 2>&1

# Check SDK
gcloud compute ssh sdk-staging-1 --zone=us-west1-b --project=livepeer-simple-infra
sudo docker logs sdk-service --tail 20 2>&1

# Monitor streams
curl -s https://sdk.daydream.monster/streams | python3 -m json.tool

# Kill zombie streams
curl -s -X POST https://sdk.daydream.monster/streams/cleanup

# Update SDK code
gcloud compute scp app.py sdk-staging-1:/tmp/app.py --zone=us-west1-b --project=livepeer-simple-infra
gcloud compute ssh sdk-staging-1 ... --command="sudo docker cp /tmp/app.py sdk-service:/app/app.py && sudo docker restart sdk-service"
```
