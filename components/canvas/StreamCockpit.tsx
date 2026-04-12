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

  /** Apply a tool call to the running stream */
  const applyAction = useCallback(
    async (action: ToolCall, intent: string) => {
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

      try {
        await controlStream(sess, prompt, params);
        useCockpitStore.getState().recordHistory(intent, action, "kept");
      } catch (e) {
        console.error("[StreamCockpit] apply failed", e);
      }
    },
    [card.refId]
  );

  const handleSubmit = useCallback(
    async (intent: string) => {
      const translated = await translateIntent(intent);
      setResult(translated);
      await applyAction(translated.applied, intent);
    },
    [applyAction]
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

  const handleRollback = useCallback(async () => {
    const sess = getSession(card.refId) || getActiveSession();
    if (!sess || !previousParams.current) return;
    try {
      await controlStream(sess, "", previousParams.current);
      if (result) {
        useCockpitStore.getState().recordHistory("(rollback)", result.applied, "rolled_back");
      }
      setResult(null);
      setActivePreset(undefined);
    } catch (e) {
      console.error("[StreamCockpit] rollback failed", e);
    }
  }, [card.refId, result]);

  const handleSwitch = useCallback(
    async (alt: ToolCall) => {
      await handleRollback();
      await applyAction(alt, `switched to ${alt.summary}`);
      setResult({ applied: alt, alternatives: result?.alternatives.filter((a) => a !== alt) || [] });
    },
    [handleRollback, applyAction, result]
  );

  if (!session) {
    return (
      <div className="border-t border-white/5 p-3 text-center text-xs text-white/40">
        No active stream
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ background: "rgba(10,10,10,0.95)" }}>
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

      {/* Live frame with HUD */}
      <div
        className="relative flex items-center justify-center"
        style={{ height: 240, background: "rgba(0,0,0,0.5)" }}
      >
        {card.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.url} alt="" className="h-full w-full object-cover" />
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
