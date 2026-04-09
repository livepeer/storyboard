# Storyboard Playback Architecture — Design Proposal

## Problem Statement

Current storyboard LV2V playback updates an `<img>` tag with individual JPEG blob URLs from polling `/stream/{id}/frame`. This creates:
- Choppy frame-by-frame display (~5 fps visual due to poll interval + decode + render)
- Object URL memory leaks (each poll creates a new blob URL)
- No frame pacing (frames arrive at poll rate, not video rate)
- No audio support in stream playback
- High CPU: JPEG decode per frame in browser

## How Scope Does It (Reference Architecture)

Scope achieves smooth, low-latency playback through a 4-stage pipeline:

```
Livepeer Network (MPEG-TS over HTTP trickle)
  → livepeer_gateway.MediaOutput (decodes MPEG-TS → av.VideoFrame)
  → FrameProcessor (pipeline processing)  
  → aiortc WebRTC encoder (VP8/H.264)
  → Browser RTCPeerConnection → <video> element (native playback)
```

Key properties:
- **WebRTC** for browser delivery — native codec, adaptive bitrate, jitter buffer
- **PTS-based frame pacing** — recreates original frame rate from timestamps
- **30fps** at 5-10Mbps adaptive bitrate
- **50-200ms** end-to-end latency
- **Native `<video>` element** — hardware-accelerated decode

## Proposed Architecture for Storyboard

### Option A: Server-Side WebRTC Relay (Scope's approach)

```
Browser webcam → SDK /stream/publish (JPEG) → MediaPublish (MPEG-TS) → trickle
  → Orch → fal runner → output trickle
  → SDK MediaOutput (decode MPEG-TS) → WebRTC encoder (aiortc) → WHEP endpoint
Browser <video> ← RTCPeerConnection ← SDK WHEP ← WebRTC stream
```

**Pros:** Smoothest playback, native video, adaptive bitrate, audio support
**Cons:** Requires aiortc on SDK (Python), WHEP endpoint, STUN/TURN servers
**Effort:** ~3-5 days
**Challenges:**
- SDK needs aiortc dependency + WHEP endpoint
- NAT traversal requires STUN/TURN infrastructure
- Each stream needs a dedicated WebRTC peer connection

### Option B: MJPEG Stream (Simplest upgrade)

```
SDK: Instead of polling /frame, serve MJPEG stream at /stream/{id}/mjpeg
  - Server-Sent Events or multipart/x-mixed-replace
  - SDK decodes MPEG-TS → JPEG → streams continuously
Browser: <img src="/stream/{id}/mjpeg"> (native MJPEG, no JS polling)
```

**Pros:** Zero browser-side JS, works everywhere, simple server implementation
**Cons:** No hardware decode acceleration, higher bandwidth than H.264, no audio
**Effort:** ~1 day
**Challenges:**
- CORS for streaming responses
- No frame pacing (server pushes as fast as decoded)
- MJPEG not as efficient as H.264

### Option C: WebSocket Binary Frames (Middle ground)

```
SDK: WebSocket endpoint /stream/{id}/ws
  - Decodes MPEG-TS → JPEG
  - Sends binary JPEG frames over WebSocket with timestamp header
Browser:
  - Receives frames via WebSocket (binary)
  - Uses frame pacing based on timestamps
  - Renders to <canvas> (double-buffered)
  - Optional: ImageBitmap for off-thread decode
```

**Pros:** Low latency, frame pacing possible, bidirectional (can send control)
**Cons:** Still JPEG per frame (no H.264 compression), canvas rendering
**Effort:** ~2 days
**Challenges:**
- WebSocket binary frame overhead
- Canvas rendering performance at high resolution
- Need to implement frame pacing in browser JS

### Option D: Media Source Extensions (MSE) — HLS-like

```
SDK: Transcode MPEG-TS → fragmented MP4 segments
  - Serve segments at /stream/{id}/segment/{n}
Browser:
  - Use MSE (MediaSource API) to feed fMP4 segments into <video>
  - Or use hls.js/dash.js for adaptive streaming
```

**Pros:** Hardware-accelerated H.264 decode, native <video>, adaptive bitrate
**Cons:** Adds ~2-5s latency (segment buffering), complex segmentation
**Effort:** ~4-5 days
**Challenges:**
- MPEG-TS → fMP4 transmuxing on SDK
- Segment boundary alignment
- MSE API complexity
- Higher latency than WebRTC

## Recommendation

**Phase 1 (immediate): Option B — MJPEG stream**
- Lowest effort, biggest improvement over current polling
- Add `/stream/{id}/mjpeg` endpoint to SDK
- Browser just sets `<img src="...">` — no polling, no JS

**Phase 2 (next sprint): Option C — WebSocket binary frames**
- Add frame pacing + timestamps
- Canvas double-buffering for smooth display
- Integrate audio frames

**Phase 3 (future): Option A — WebRTC relay**
- Full Scope-quality playback
- Requires infrastructure investment (STUN/TURN)
- Best for production

## Phase 1 Implementation Plan

### SDK Changes (`app.py`)

1. Add MJPEG streaming endpoint:
```python
@app.get("/stream/{stream_id}/mjpeg")
async def stream_mjpeg(stream_id: str):
    """Stream output frames as MJPEG (multipart/x-mixed-replace)."""
    session = _stream_sessions.get(stream_id)
    if not session:
        raise HTTPException(status_code=404)
    
    async def generate():
        last_seq = -1
        while not session.get("stopped"):
            jpeg = session.get("latest_frame_jpeg")
            seq = session.get("frame_seq", 0)
            if jpeg and seq > last_seq:
                last_seq = seq
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n"
                    + jpeg + b"\r\n"
                )
            else:
                await asyncio.sleep(0.033)  # ~30fps poll
    
    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
```

2. No changes to existing `/frame` endpoint (backward compatible)

### Browser Changes (`session.ts` + `Card.tsx`)

1. When stream is ready, set card URL to MJPEG endpoint:
```typescript
session.onReady = () => {
  updateCard(card.id, { 
    url: `${sdkUrl()}/stream/${session.streamId}/mjpeg` 
  });
};
```

2. Card.tsx: stream type already renders as `<img>` — MJPEG just works

3. Remove polling logic for streams (no more `startPolling` for MJPEG streams)

### Technical Challenges

| Challenge | Mitigation |
|---|---|
| CORS for streaming | SDK already has CORSMiddleware with `allow_origins=["*"]` |
| Auth header on `<img src>` | Pass token as query param: `/mjpeg?token=sk_...` |
| Memory: server holds latest frame | Already doing this (`latest_frame_jpeg`) |
| Connection drop recovery | Browser auto-reconnects MJPEG `<img>` on error |
| Multiple viewers | Each GET creates independent generator; OK for 1-2 viewers |

## Open Questions for Review

1. **MJPEG vs WebSocket for Phase 1?** MJPEG is simpler but WebSocket gives more control.
2. **Auth via query param or cookie?** `<img src>` can't send Authorization headers.
3. **Should we keep polling as fallback** for browsers that don't support MJPEG?
4. **Phase 3 timeline?** WebRTC relay is the gold standard but needs STUN/TURN infra.
5. **Audio integration?** MJPEG is video-only. When do we need audio in LV2V?
