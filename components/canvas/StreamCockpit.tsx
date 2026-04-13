"use client";

import { useState, useCallback, useRef } from "react";
import type { Card as CardData } from "@/lib/canvas/types";
import { getSession, getActiveSession, controlStream } from "@/lib/stream/session";
import { translateIntent } from "@/lib/stream/cockpit-agent";
import { useCockpitStore } from "@/lib/stream/cockpit-store";
import { SCOPE_PRESETS } from "@/lib/stream/scope-params";
import type { ToolCall, IntentResult } from "@/lib/stream/cockpit-types";
import { HudOverlay } from "./StreamCockpit/HudOverlay";
import { PresetChips } from "./StreamCockpit/PresetChips";
import { IntentInput } from "./StreamCockpit/IntentInput";
import { SuggestionChips } from "./StreamCockpit/SuggestionChips";
import { ActivityFeed } from "./StreamCockpit/ActivityFeed";

interface Props {
  card: CardData;
}

export function StreamCockpit({ card }: Props) {
  const [result, setResult] = useState<IntentResult | null>(null);
  const [activePreset, setActivePreset] = useState<string | undefined>();
  const previousParams = useRef<Record<string, unknown> | null>(null);

  const session = getSession(card.refId) || getActiveSession();
  const isActive = !!session && !session.stopped;

  /** Apply a tool call to the running stream.
   *
   * Fire-and-forget: the UI state is updated synchronously (via
   * setResult / setActivePreset in callers) and the network call
   * runs in the background. This keeps the cockpit feeling instant —
   * the only remaining latency is the fal-side apply (~1.5-3s for a
   * new frame with the updated prompt to propagate through the
   * pipeline), which is irreducible.
   */
  const applyAction = useCallback(
    (action: ToolCall, intent: string) => {
      const sess = getSession(card.refId) || getActiveSession();
      if (!sess) return;
      previousParams.current = { ...(sess.lastParams || {}) };

      const params: Record<string, unknown> = { ...action.params };
      const prompt = (params.prompts as string) || "";
      delete params.prompts;

      // For preset apply: pull preset params from SCOPE_PRESETS
      if (action.tool === "scope_apply_preset" && params.preset) {
        const preset = SCOPE_PRESETS.find((p) => p.id === params.preset);
        if (preset) {
          Object.assign(params, preset.params);
          setActivePreset(preset.id);
        }
        delete params.preset;
      }

      // Record history optimistically. If the network call fails we
      // downgrade to rolled_back — but most of the time this just
      // works and the user sees the update reflected in a few seconds.
      useCockpitStore.getState().recordHistory(intent, action, "kept");

      controlStream(sess, prompt, params).catch((e: unknown) => {
        console.error("[StreamCockpit] apply failed", e);
      });
    },
    [card.refId],
  );

  const handleSubmit = useCallback(
    async (intent: string) => {
      // translateIntent is fast (pattern matching, no LLM) — still
      // async because it returns a Promise for future extensibility.
      const translated = await translateIntent(intent);
      setResult(translated);
      applyAction(translated.applied, intent);
    },
    [applyAction],
  );

  const handlePreset = useCallback(
    (presetId: string) => {
      const preset = SCOPE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      const action: ToolCall = {
        tool: "scope_apply_preset",
        params: { preset: presetId, ...preset.params },
        summary: `applied ${preset.name} preset`,
        kind: "preset",
      };
      setResult({ applied: action, alternatives: [] });
      applyAction(action, `preset ${presetId}`);
    },
    [applyAction]
  );

  const handleRollback = useCallback(() => {
    const sess = getSession(card.refId) || getActiveSession();
    if (!sess || !previousParams.current) return;
    // Fire-and-forget rollback: UI state flips immediately, network
    // catches up in the background.
    if (result) {
      useCockpitStore.getState().recordHistory("(rollback)", result.applied, "rolled_back");
    }
    const prev = previousParams.current;
    setResult(null);
    setActivePreset(undefined);
    controlStream(sess, "", prev).catch((e: unknown) => {
      console.error("[StreamCockpit] rollback failed", e);
    });
  }, [card.refId, result]);

  const handleSwitch = useCallback(
    (alt: ToolCall) => {
      // Both handleRollback and applyAction are now sync/optimistic —
      // they fire network calls in the background and return
      // immediately. The UI flips to the new alt without waiting.
      handleRollback();
      applyAction(alt, `switched to ${alt.summary}`);
      setResult({ applied: alt, alternatives: result?.alternatives.filter((a) => a !== alt) || [] });
    },
    [handleRollback, applyAction, result],
  );

  if (!session) {
    return (
      <div className="border-t border-white/5 p-3 text-center text-xs text-white/40">
        No active stream
      </div>
    );
  }

  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-y-auto scrollbar-hidden"
      style={{ background: "rgba(10,10,10,0.95)" }}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-pink-500/20 px-3 py-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: isActive ? "#10b981" : "#666",
            boxShadow: isActive ? "0 0 4px #10b981" : undefined,
          }}
        />
        <span className="flex-1 text-xs font-semibold text-white">{card.title}</span>
        <span className="font-mono text-[9px] text-green-400/80">
          pub:{session.publishOk} &middot; recv:{session.totalRecv}
        </span>
      </div>

      {/* Live frame with HUD — fixed square 640px so video shows fully */}
      <div
        className="relative flex shrink-0 items-center justify-center"
        style={{ height: 640, width: "100%", background: "rgba(0,0,0,0.85)" }}
      >
        {card.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.url} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-white/30">waiting for output&hellip;</span>
        )}
        {isActive && <HudOverlay session={session} />}
      </div>

      {/* Preset chips */}
      <div className="px-3 py-2">
        <PresetChips activePresetId={activePreset} onApply={handlePreset} />
      </div>

      {/* Intent input */}
      <div className="px-3 pb-2">
        <IntentInput onSubmit={handleSubmit} disabled={!isActive} />
      </div>

      {/* Suggestion chips */}
      {result && (
        <div className="px-3 pb-2">
          <SuggestionChips
            applied={result.applied}
            alternatives={result.alternatives}
            onRollback={handleRollback}
            onSwitch={handleSwitch}
          />
        </div>
      )}

      {/* Activity feed */}
      <ActivityFeed />
    </div>
  );
}
