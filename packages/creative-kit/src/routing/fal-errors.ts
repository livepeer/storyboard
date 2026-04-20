export function extractFalError(data: Record<string, unknown>): string | undefined {
  const detail = data.detail;
  if (detail === undefined || detail === null) {
    return undefined;
  }
  if (typeof detail === "string") {
    return detail || undefined;
  }
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null && "msg" in item) {
          return String((item as Record<string, unknown>).msg);
        }
        return String(item);
      })
      .filter(Boolean);
    return msgs.length > 0 ? msgs.join("; ") : undefined;
  }
  return String(detail) || undefined;
}

const NON_RECOVERABLE_PATTERNS = [
  "failed to fetch",
  "err_connection",
  "networkerror",
  "cors",
  "401",
  "payment failed",
  "signer",
  "authentication failed",
  "api key",
];

export function isRecoverableFailure(errorMsg: string | undefined): boolean {
  if (!errorMsg) {
    // undefined/empty → recoverable (empty-result case)
    return true;
  }
  const lower = errorMsg.toLowerCase();
  for (const pattern of NON_RECOVERABLE_PATTERNS) {
    if (lower.includes(pattern)) {
      return false;
    }
  }
  return true;
}
