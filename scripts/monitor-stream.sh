#!/bin/bash
# Monitor an LV2V stream — polls status, publish health, frame output
# Usage: ./scripts/monitor-stream.sh <stream_id> [sdk_url] [api_key]

STREAM_ID="${1:?Usage: $0 <stream_id> [sdk_url] [api_key]}"
SDK_URL="${2:-https://sdk.daydream.monster}"
API_KEY="${3:-}"

AUTH=""
if [ -n "$API_KEY" ]; then
  AUTH="-H \"Authorization: Bearer $API_KEY\""
fi

echo "Monitoring stream: $STREAM_ID"
echo "SDK: $SDK_URL"
echo "───────────────────────────────────"

PREV_PHASE=""
PREV_FRAMES=0
CHECKS=0

while true; do
  CHECKS=$((CHECKS + 1))

  # Get stream status
  STATUS=$(eval curl -s "$AUTH" "$SDK_URL/stream/$STREAM_ID/status" 2>/dev/null)

  if [ $? -ne 0 ] || echo "$STATUS" | grep -q '"detail"'; then
    echo "[$(date +%H:%M:%S)] ERROR: $(echo $STATUS | python3 -c 'import sys,json; print(json.load(sys.stdin).get("detail","unknown"))' 2>/dev/null || echo "$STATUS")"
    if [ $CHECKS -gt 3 ]; then
      echo "Stream appears dead. Exiting."
      exit 1
    fi
    sleep 2
    continue
  fi

  PHASE=$(echo "$STATUS" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("phase","?"))' 2>/dev/null)
  READY=$(echo "$STATUS" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("ready",False))' 2>/dev/null)
  FRAMES=$(echo "$STATUS" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("frames_out",0))' 2>/dev/null)
  ERROR=$(echo "$STATUS" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("error",""))' 2>/dev/null)

  # Phase change
  if [ "$PHASE" != "$PREV_PHASE" ]; then
    echo "[$(date +%H:%M:%S)] PHASE: $PHASE (ready=$READY)"
    PREV_PHASE="$PHASE"
  fi

  # Error
  if [ -n "$ERROR" ]; then
    echo "[$(date +%H:%M:%S)] ERROR: $ERROR"
  fi

  # Frame output progress
  if [ "$FRAMES" != "$PREV_FRAMES" ] && [ "$FRAMES" != "0" ]; then
    DELTA=$((FRAMES - PREV_FRAMES))
    echo "[$(date +%H:%M:%S)] FRAMES OUT: $FRAMES (+$DELTA)"
    PREV_FRAMES=$FRAMES
  fi

  # Ready check
  if [ "$READY" = "True" ] && [ "$PREV_PHASE" = "ready" ] && [ $CHECKS -eq 1 ]; then
    echo "[$(date +%H:%M:%S)] Pipeline READY — publishing should work"
  fi

  # Periodic full status dump (every 30s)
  if [ $((CHECKS % 15)) -eq 0 ]; then
    echo "[$(date +%H:%M:%S)] STATUS: phase=$PHASE ready=$READY frames=$FRAMES"
  fi

  sleep 2
done
