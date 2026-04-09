#!/bin/bash
set -euo pipefail
# ──────────────────────────────────────────────────────────────────────────────
# dev.sh — Quick local development setup for Storyboard A3
# ──────────────────────────────────────────────────────────────────────────────
# Usage:
#   ./scripts/dev.sh          # Install deps + start dev server
#   ./scripts/dev.sh test     # Run unit tests
#   ./scripts/dev.sh e2e      # Run E2E tests
#   ./scripts/dev.sh build    # Production build
#   ./scripts/dev.sh deploy   # Deploy to Vercel (switches to seanhanca)
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[0;90m'
RESET='\033[0m'

log()  { echo -e "${GREEN}▸${RESET} $1"; }
warn() { echo -e "${RED}▸${RESET} $1"; }
dim()  { echo -e "${DIM}  $1${RESET}"; }

# ── Check prerequisites ──
check_prereqs() {
  local missing=false
  for cmd in node npm; do
    if ! command -v "$cmd" &>/dev/null; then
      warn "Missing: $cmd"
      missing=true
    fi
  done
  if [[ "$missing" == "true" ]]; then
    warn "Install Node.js 20+ first: https://nodejs.org"
    exit 1
  fi
  dim "Node $(node -v) | npm $(npm -v)"
}

# ── Install dependencies ──
install_deps() {
  if [[ ! -d "node_modules" ]]; then
    log "Installing dependencies..."
    npm install
  else
    dim "node_modules exists, skipping install (run 'npm install' to update)"
  fi
}

# ── Commands ──
cmd_dev() {
  check_prereqs
  install_deps
  log "Starting dev server on http://localhost:3000"
  dim "SDK: https://sdk.daydream.monster"
  dim "Press Ctrl+C to stop"
  echo ""
  npm run dev
}

cmd_test() {
  install_deps
  log "Running unit tests..."
  npx vitest run
}

cmd_e2e() {
  install_deps
  if ! npx playwright --version &>/dev/null; then
    log "Installing Playwright browsers..."
    npx playwright install chromium
  fi
  log "Running E2E tests..."
  npx playwright test
}

cmd_build() {
  install_deps
  log "Building for production..."
  npm run build
}

cmd_deploy() {
  cmd_build
  log "Switching to seanhanca for push access..."
  gh auth switch --user seanhanca
  log "Deploying to Vercel..."
  vercel deploy --prod --scope livepeer-foundation
  log "Switching back to qianghan..."
  gh auth switch --user qianghan
  log "Deployed!"
}

cmd_push() {
  log "Switching to seanhanca for push access..."
  gh auth switch --user seanhanca
  git push "$@"
  log "Switching back to qianghan..."
  gh auth switch --user qianghan
}

# ── Main ──
case "${1:-dev}" in
  dev)    cmd_dev ;;
  test)   cmd_test ;;
  e2e)    cmd_e2e ;;
  build)  cmd_build ;;
  deploy) cmd_deploy ;;
  push)   shift; cmd_push "$@" ;;
  *)
    echo "Usage: ./scripts/dev.sh [dev|test|e2e|build|deploy|push]"
    echo ""
    echo "  dev     Install deps + start dev server (default)"
    echo "  test    Run vitest unit tests"
    echo "  e2e     Run Playwright E2E tests"
    echo "  build   Production build"
    echo "  deploy  Build + deploy to Vercel production"
    echo "  push    Git push via seanhanca account"
    exit 1
    ;;
esac
