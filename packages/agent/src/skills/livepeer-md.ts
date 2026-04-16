import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadLivepeerMd(projectRoot: string): string {
  const path = join(projectRoot, "livepeer.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}
