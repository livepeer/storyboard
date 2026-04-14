#!/usr/bin/env bun
import { VERSION } from "../index.js";

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log(`livepeer ${VERSION}`);
  process.exit(0);
}

console.log(`livepeer agent v${VERSION} (CLI placeholder, Phase 8 lands the real TUI)`);
