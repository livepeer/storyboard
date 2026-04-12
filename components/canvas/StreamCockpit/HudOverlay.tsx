"use client";

import type { Lv2vSession } from "@/lib/stream/session";

interface Props {
  session: Lv2vSession;
  graphTemplate?: string;
  pipelineId?: string;
}

export function HudOverlay({ session, graphTemplate, pipelineId }: Props) {
  const params = session.lastParams || {};
  const noise = params.noise_scale as number | undefined;
  const cache = params.kv_cache_attention_bias as number | undefined;
  const steps = params.denoising_step_list as number[] | undefined;

  return (
    <>
      <div
        className="absolute left-2 top-2 flex gap-3 rounded-md px-2.5 py-1.5 backdrop-blur-md"
        style={{ background: "rgba(0,0,0,0.6)", fontFamily: "monospace", fontSize: 10, color: "#fff" }}
      >
        <span>noise <b style={{ color: "#ec4899" }}>{noise !== undefined ? noise.toFixed(2) : "\u2014"}</b></span>
        <span>cache <b style={{ color: "#06b6d4" }}>{cache !== undefined ? cache.toFixed(2) : "\u2014"}</b></span>
        {steps && steps.length > 0 && (
          <span>steps <b style={{ color: "#10b981" }}>[{steps.join(",")}]</b></span>
        )}
      </div>
      {(graphTemplate || pipelineId) && (
        <div
          className="absolute right-2 top-2 rounded-md px-2.5 py-1.5 backdrop-blur-md"
          style={{ background: "rgba(0,0,0,0.6)", fontSize: 10, color: "#06b6d4" }}
        >
          &#x2699; {graphTemplate || "simple-lv2v"} &middot; {pipelineId || "longlive"}
        </div>
      )}
    </>
  );
}
