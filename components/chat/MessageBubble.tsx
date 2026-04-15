"use client";

import { useState, useCallback } from "react";
import type { ChatMessage } from "@/lib/chat/store";
import { RatingWidget } from "./RatingWidget";

const roleStyles: Record<string, string> = {
  user: "self-end bg-white/[0.08] text-[var(--text)]",
  agent: "self-start bg-transparent text-[var(--text-muted)]",
  system: "self-center font-mono text-[10px] text-[var(--text-dim)]",
};

/** Distinct visual style for user messages that are slash commands
 * (/context, /organize, /skills load, etc). Tinted blue so the user
 * can scan the transcript and tell at a glance which lines were
 * commands vs. free-form prompts. */
const SLASH_COMMAND_STYLE =
  "self-end bg-blue-500/15 border border-blue-500/30 font-mono text-[11px] text-blue-300";

function isSlashCommand(text: string): boolean {
  return /^\s*\/\w/.test(text);
}

/** Check if a system message is an error that needs red highlighting */
function isErrorMessage(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("failed") || lower.includes("error") || lower.includes("blocked")
    || lower.includes("can't reach") || lower.includes("timed out") || lower.includes("too complex")
    || lower.includes("couldn't") || lower.includes("authentication");
}

const RATING_RE = /\[rate:([^:]+):([^:]*):([^\]]*)\]/;

// Match /skills/load xxx commands in system messages
const CMD_RE = /\/skills\/load\s+(\S+)/g;

/** Render text with clickable /skills/load commands */
function RichText({ text, onClick }: { text: string; onClick?: (cmd: string) => void }) {
  const parts: Array<{ type: "text" | "cmd"; value: string; cmd?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(CMD_RE.source, "g");

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "cmd", value: match[0], cmd: match[0] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  if (parts.length === 0) return <>{text}</>;

  return (
    <>
      {parts.map((p, i) =>
        p.type === "cmd" ? (
          <button
            key={i}
            onClick={() => onClick?.(p.cmd!)}
            className="mx-0.5 inline-flex items-center gap-1 rounded bg-purple-500/15 px-1.5 py-0.5 font-mono text-[9px] text-purple-300 transition-colors hover:bg-purple-500/25 active:bg-purple-500/35"
            title="Click to copy to input"
          >
            <span>{p.value}</span>
            <span className="text-[8px] opacity-60">&#x2398;</span>
          </button>
        ) : (
          <span key={i}>{p.value}</span>
        )
      )}
    </>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const ratingMatch = message.role === "agent" ? RATING_RE.exec(message.text) : null;
  const [copied, setCopied] = useState(false);

  const handleCmdClick = (cmd: string) => {
    // Dispatch prefill event to put command in the input
    window.dispatchEvent(
      new CustomEvent("chat-prefill", { detail: { text: cmd } })
    );
  };

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [message.text]);

  const isError = message.role === "system" && isErrorMessage(message.text);
  const isUserCommand = message.role === "user" && isSlashCommand(message.text);
  const isCopyable = message.role === "user" || message.role === "agent";

  return (
    <div
      className={`group relative max-w-[90%] break-words rounded-lg px-3 py-2 text-xs ${
        isCopyable ? "cursor-pointer" : ""
      } ${
        isError
          ? "self-center font-mono text-[10px] bg-red-500/8 border border-red-500/20 text-red-400"
          : isUserCommand
            ? SLASH_COMMAND_STYLE
            : (roleStyles[message.role] || roleStyles.agent)
      }`}
      onClick={isCopyable ? handleCopy : undefined}
      title={isCopyable ? "Click to copy" : undefined}
    >
      {copied && (
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-white/15 px-1.5 py-0.5 text-[9px] text-[var(--text)] backdrop-blur-sm">
          Copied!
        </span>
      )}
      {ratingMatch ? (
        <>
          {message.text.replace(RATING_RE, "").trim()}
          <div className="mt-1">
            <RatingWidget
              refId={ratingMatch[1]}
              capability={ratingMatch[2]}
              prompt={ratingMatch[3]}
            />
          </div>
        </>
      ) : message.role === "system" && message.text.includes("/skills/load") ? (
        <RichText text={message.text} onClick={handleCmdClick} />
      ) : (
        <span style={{ whiteSpace: "pre-wrap" }}>{message.text}</span>
      )}
    </div>
  );
}
