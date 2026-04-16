Summary

  Problem

  BYOC inference failing with HTTP 502 — signer returning 404 on /sign-byoc-job, BYOC orch rejecting with "Could not
   verify job creds".

  Root Cause

  Signer VMs redeployed with livepeer/go-livepeer:ja-serverless (PR #3884) which intentionally removed the
  /sign-byoc-job endpoint. The previous image feat-remote-signer-byoc-v2 (PR #3896) had it.

  What Was Done

  1. go-livepeer fix (livepeer/go-livepeer#3899)
  - Created feat/add-byoc-signing branch from ja/serverless
  - Cherry-picked SignBYOCJobRequest handler + FlattenBYOCJob (129 lines, 2 files)
  - CI passed: all builds + Docker image generation (livepeer/go-livepeer:pr-3899)

  2. Deployed to both signer VMs
  - signer-staging-1 and signer-staging-2 running pr-3899 with --network host
  - Legacy systemd service and bare binary cleaned from both VMs

  3. E2E tests passed
  - /sign-byoc-job returns valid signatures on both VMs
  - /sign-orchestrator-info works (existing endpoint)
  - generate-live-payment processes correctly (Daydream billing webhook auth active)
  - Full inference: SDK → signer → BYOC orch → fal.ai → image URL returned

  4. simple-infra updated (livepeer/simple-infra#10)
  - setup-signer.sh: Rewritten for Docker deployment
  - update-signer.sh: Rewritten for rolling Docker update
  - bootstrap.sh: step_deploy_signer() uses Docker
  - signers.yaml: Documents image + webhook flags
  - how-to-guide.md, what-is-on-staging.md, current_snapshot_28_03_2026.md: Updated to reflect Docker reality

  4-hour timeout

  The LIVE_AI_SERVERLESS_TIMEOUT env var (commit 610ee3bd on ja/serverless) is an orch-level config, not signer. Set
   it on orch-staging-1/2 via Docker env, e.g. -e LIVE_AI_SERVERLESS_TIMEOUT=4h.

  ---
  Now let me look at the storyboard generation bug you're seeing — cards being removed and renamed during
  multi-scene generation.