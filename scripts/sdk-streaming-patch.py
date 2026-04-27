"""
SDK Streaming Inference Patch

Apply this to app.py on sdk-staging-1 to add /inference/stream endpoint.
This endpoint streams SSE heartbeats (elapsed seconds) every 1s during
inference, then the final result when done.

Usage:
  1. SSH to sdk-staging-1
  2. Copy this to /tmp/patch.py
  3. Run: python3 /tmp/patch.py /app/app.py
  4. Restart: docker restart sdk-service

Or apply manually: add the inference_stream function after the /inference endpoint.
"""

import sys

PATCH_CODE = '''

# ── Streaming inference (SSE heartbeats) ──
# Added by sdk-streaming-patch.py

@app.post("/inference/stream")
async def inference_stream(req: InferenceRequest, request: Request):
    """SSE endpoint: streams elapsed-time heartbeats every 1s, then final result.

    Same input as /inference. Returns text/event-stream with:
      data: {"status":"running","elapsed":1,"capability":"seedance-i2v"}
      data: {"status":"running","elapsed":2,"capability":"seedance-i2v"}
      ...
      data: {"status":"done","capability":"...","image_url":"...","video_url":"...","elapsed_ms":...}
      data: [DONE]
    """
    import json as _json
    from starlette.responses import StreamingResponse

    t0 = time.time()
    payload = {**req.params}
    is_tts = any(k in req.capability.lower() for k in ["tts", "chatterbox", "lux-tts", "speech"])
    if req.prompt and "text" not in payload:
        if is_tts:
            payload["text"] = req.prompt
        else:
            payload["prompt"] = req.prompt
    if req.image_data:
        if not req.image_data.startswith("data:"):
            payload["image_url"] = f"data:image/jpeg;base64,{req.image_data}"
        else:
            payload["image_url"] = req.image_data

    byoc_req = ByocJobRequest(
        capability=req.capability,
        payload=payload,
        timeout_seconds=req.timeout,
    )

    signer_hdrs = _extract_signer_headers(request)
    _current_signer_headers.set(signer_hdrs)

    result_holder = {"done": False, "result": None, "error": None}

    async def _run():
        try:
            r = await asyncio.to_thread(
                submit_byoc_job,
                byoc_req,
                orch_url=ORCH_URL,
                signer_url=SIGNER_URL or None,
                signer_headers=signer_hdrs,
                timeout=req.timeout,
            )
            result_holder["result"] = r
        except Exception as e:
            result_holder["error"] = str(e)
        finally:
            result_holder["done"] = True

    asyncio.create_task(_run())

    async def _events():
        while not result_holder["done"]:
            elapsed = int(time.time() - t0)
            yield f"data: {_json.dumps({\'status\': \'running\', \'elapsed\': elapsed, \'capability\': req.capability})}\\n\\n"
            await asyncio.sleep(1)

        elapsed_ms = int((time.time() - t0) * 1000)

        if result_holder["error"]:
            err = str(result_holder["error"])[:300].replace(\'"\', \'\\\\"\')
            yield f\'data: {{"status":"error","error":"{err}","elapsed_ms":{elapsed_ms}}}\\n\\n\'
        else:
            r = result_holder["result"]
            resp = {
                "status": "done",
                "capability": req.capability,
                "image_url": getattr(r, "image_url", None),
                "video_url": getattr(r, "video_url", None),
                "audio_url": getattr(r, "audio_url", None),
                "data": getattr(r, "data", None),
                "balance": getattr(r, "balance", None),
                "elapsed_ms": elapsed_ms,
            }
            yield f"data: {_json.dumps(resp)}\\n\\n"
        yield "data: [DONE]\\n\\n"

    return StreamingResponse(_events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

'''

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 patch.py <path-to-app.py>")
        sys.exit(1)

    path = sys.argv[1]
    with open(path, "r") as f:
        content = f.read()

    # Insert after the /inference endpoint (before @app.post("/train"...))
    marker = '@app.post("/train"'
    if marker not in content:
        print(f"ERROR: Could not find '{marker}' in {path}")
        sys.exit(1)

    if "/inference/stream" in content:
        print("SKIP: /inference/stream already exists in app.py")
        sys.exit(0)

    content = content.replace(marker, PATCH_CODE + "\n" + marker)

    with open(path, "w") as f:
        f.write(content)

    print(f"PATCHED: Added /inference/stream to {path}")
    print("Restart the service: docker restart sdk-service")
