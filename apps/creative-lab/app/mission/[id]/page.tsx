"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getMission } from "../../../lib/missions/catalog";
import { safePrompt, friendlyError } from "../../../lib/missions/safety";
import { startMission, getCurrentStep, advanceToNextStep } from "../../../lib/missions/engine";
import { useProgressStore } from "../../../lib/stores/progress-store";
import { StepGuide } from "../../../components/StepGuide";
import { CelebrationOverlay } from "../../../components/CelebrationOverlay";
import { SafeErrorMessage } from "../../../components/SafeErrorMessage";
import { resizeImageForModel } from "@livepeer/creative-kit";

interface Artifact {
  id: string;
  url: string;
  prompt: string;
  type: "image" | "video" | "audio";
}

/** Call the SDK inference endpoint. Shared by all generation steps. */
async function callSDK(capability: string, prompt: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const sdkUrl = (typeof window !== "undefined" && localStorage.getItem("sdk_service_url")) || "https://sdk.daydream.monster";
  const apiKey = (typeof window !== "undefined" && localStorage.getItem("sdk_api_key")) || "";

  const resp = await fetch(`${sdkUrl}/inference`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ capability, prompt, params }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(errText.slice(0, 200) || `HTTP ${resp.status}`);
  }
  return resp.json();
}

/** Extract media URL from SDK response */
function extractUrl(result: Record<string, unknown>): string | undefined {
  const data = (result.data ?? result) as Record<string, unknown>;
  const images = data.images as Array<{ url: string }> | undefined;
  const image = data.image as { url: string } | undefined;
  const video = data.video as { url: string } | undefined;
  const audio = data.audio as { url: string } | undefined;
  return (result.image_url as string)
    ?? images?.[0]?.url
    ?? image?.url
    ?? (result.video_url as string)
    ?? video?.url
    ?? (result.audio_url as string)
    ?? audio?.url
    ?? (data.url as string);
}

export default function MissionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const mission = getMission(id);

  // Subscribe reactively to the progress array so re-renders happen on store changes
  const allProgress = useProgressStore((s) => s.progress);
  const { completeMission, addArtifact } = useProgressStore();
  const [mounted, setMounted] = useState(false);
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  // Defer rendering until hydration is complete (progress store reads localStorage)
  useEffect(() => setMounted(true), []);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  // Creative state built up across steps
  const [lastPrompt, setLastPrompt] = useState("");
  const [stylePrefix, setStylePrefix] = useState("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  // Auto-start mission
  const progress = mounted ? allProgress.find((p) => p.missionId === id) : undefined;

  useEffect(() => {
    if (mounted && mission && !progress) startMission(id);
  }, [id, mission, mounted, progress]);

  const currentStep = mounted ? getCurrentStep(id) : null;
  const stepNumber = progress?.currentStep ?? 0;
  const lastArtifactUrl = artifacts.length > 0 ? artifacts[artifacts.length - 1].url : undefined;

  const addArt = (url: string, prompt: string, type: "image" | "video" | "audio" = "image") => {
    const a: Artifact = { id: `art-${Date.now()}`, url, prompt, type };
    setArtifacts((prev) => [...prev, a]);
    addArtifact(id, a.id);
    return a;
  };

  const handleStepSubmit = useCallback(async (input: string) => {
    if (!currentStep || !mission) return;
    setError(null);

    try {
      switch (currentStep.type) {
        // ── SPARK PICK — save the prompt, advance ──
        case "spark_pick":
        case "text_input": {
          setLastPrompt(input);
          advanceToNextStep(id);
          rerender();
          return;
        }

        // ── STYLE PICK — save the style prefix, advance ──
        case "style_pick": {
          setStylePrefix(input); // input is the style promptPrefix
          advanceToNextStep(id);
          rerender();
          return;
        }

        // ── GENERATE — create an image ──
        case "generate": {
          setIsLoading(true);
          const prompt = safePrompt(lastPrompt, (stylePrefix || "") + (currentStep.autoPromptPrefix || ""));
          const result = await callSDK(currentStep.capability || "flux-dev", prompt);
          const url = extractUrl(result);
          if (!url) throw new Error("No image returned");
          addArt(url, prompt);
          advanceToNextStep(id);
          rerender();
          return;
        }

        // ── TRANSFORM — modify existing image ──
        case "transform": {
          setIsLoading(true);
          const prompt = safePrompt(input, currentStep.autoPromptPrefix || "");
          const result = await callSDK(currentStep.capability || "kontext-edit", prompt, {
            image_url: lastArtifactUrl,
          });
          const url = extractUrl(result);
          if (!url) throw new Error("No image returned");
          addArt(url, prompt);
          advanceToNextStep(id);
          rerender();
          return;
        }

        // ── REMIX — generate a variation ──
        case "remix": {
          if (input === "skip-remix") {
            advanceToNextStep(id);
            rerender();
            return;
          }
          setIsLoading(true);
          // Remix = same prompt + style, different seed (SDK handles randomness)
          const prompt = safePrompt(lastPrompt, stylePrefix + (currentStep.autoPromptPrefix || ""));
          const result = await callSDK(currentStep.capability || "flux-dev", prompt);
          const url = extractUrl(result);
          if (!url) throw new Error("No image returned");
          addArt(url, prompt);
          // Don't advance — let the kid remix more or skip
          rerender();
          return;
        }

        // ── ANIMATE — image → video (resize + fallback chain) ──
        case "animate": {
          setIsLoading(true);
          if (!lastArtifactUrl) throw new Error("No image to animate");

          // Resize source image to fit video model limits (1024x1024, <5MB)
          let resizedUrl: string;
          try {
            resizedUrl = await resizeImageForModel(lastArtifactUrl, 1024, 1024, 5_000_000);
          } catch {
            resizedUrl = lastArtifactUrl; // fallback to original
          }

          const animPrompt = safePrompt(lastPrompt, currentStep.autoPromptPrefix || "");
          const caps = [currentStep.capability || "seedance-i2v", "ltx-i2v", "veo-i2v"];
          let animUrl: string | undefined;
          for (const cap of caps) {
            try {
              const params: Record<string, unknown> = { image_url: resizedUrl };
              if (cap.startsWith("seedance")) {
                params.duration = "8";
                params.generate_audio = true;
              }
              const result = await callSDK(cap, animPrompt, params);
              animUrl = extractUrl(result);
              if (animUrl) break;
            } catch (e) {
              console.warn(`[CreativeLab] ${cap} failed, trying next:`, (e as Error).message?.slice(0, 100));
              continue;
            }
          }
          if (!animUrl) throw new Error("Video creation didn't work — try skipping this step");
          addArt(animUrl, animPrompt, "video");
          advanceToNextStep(id);
          rerender();
          return;
        }

        // ── NARRATE — text → speech → talking head ──
        case "narrate": {
          setIsLoading(true);
          if (!lastArtifactUrl) throw new Error("No image for talking head");
          // Resize for talking-head model
          let narrateImg: string;
          try { narrateImg = await resizeImageForModel(lastArtifactUrl, 1024, 1024, 5_000_000); }
          catch { narrateImg = lastArtifactUrl; }
          // Step A: TTS
          const ttsResult = await callSDK("chatterbox-tts", input, { text: input });
          const audioUrl = extractUrl(ttsResult);
          if (!audioUrl) throw new Error("No audio returned");
          addArt(audioUrl, input, "audio");
          // Step B: Talking head
          const thResult = await callSDK("talking-head", "talking head animation", {
            image_url: narrateImg,
            audio_url: audioUrl,
          });
          const videoUrl = extractUrl(thResult);
          if (!videoUrl) throw new Error("No video returned");
          addArt(videoUrl, input, "video");
          advanceToNextStep(id);
          rerender();
          return;
        }

        // ── STORY_GEN — generate multi-scene story ──
        case "story_gen": {
          setIsLoading(true);
          const storyPrompt = safePrompt(lastPrompt, stylePrefix);
          // Generate 4 scenes via the SDK (same pattern as /story)
          for (let i = 0; i < 4; i++) {
            const scenePrompt = `Scene ${i + 1} of 4: ${storyPrompt}, sequential storytelling, scene ${i + 1}`;
            const result = await callSDK(currentStep.capability || "flux-dev", scenePrompt);
            const url = extractUrl(result);
            if (url) addArt(url, scenePrompt);
          }
          advanceToNextStep(id);
          rerender();
          return;
        }

        // ── FILM_GEN — generate 4-shot film ──
        case "film_gen": {
          setIsLoading(true);
          const filmPrompt = safePrompt(lastPrompt, stylePrefix);
          const cameras = ["wide establishing shot", "medium tracking shot", "close-up detail", "pull-back reveal"];
          for (let i = 0; i < 4; i++) {
            const shotPrompt = `${cameras[i]}, ${filmPrompt}, cinematic, shot ${i + 1} of 4`;
            const result = await callSDK(currentStep.capability || "flux-dev", shotPrompt);
            const url = extractUrl(result);
            if (url) addArt(url, shotPrompt);
          }
          advanceToNextStep(id);
          rerender();
          return;
        }

        // ── REVIEW — just advance ──
        case "review": {
          advanceToNextStep(id);
          rerender();
          return;
        }

        // ── CELEBRATE ──
        case "celebrate": {
          setShowCelebration(true);
          return;
        }
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong!";
      console.error(`[CreativeLab] Step "${currentStep.type}" failed:`, raw);
      setError(friendlyError(raw));
    } finally {
      setIsLoading(false);
    }
  }, [currentStep, mission, id, lastPrompt, stylePrefix, lastArtifactUrl, addArtifact]);

  // Auto-trigger celebrate — but NOT if already completed (revisiting a done mission)
  useEffect(() => {
    if (currentStep?.type === "celebrate" && !progress?.completed) {
      setShowCelebration(true);
    }
  }, [currentStep?.type, progress?.completed]);

  // Early returns AFTER all hooks (React Rules of Hooks)
  if (!mission) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Mission not found.</p>
        <button onClick={() => router.push("/")} style={{ marginTop: 16, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
          ← Back to missions
        </button>
      </div>
    );
  }

  if (!mounted) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>{mission.icon}</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text)" }}>{mission.title}</h1>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>
      {/* Back */}
      <button onClick={() => router.push("/")} style={{
        background: "none", border: "none", color: "var(--text-muted)",
        cursor: "pointer", fontWeight: 700, fontSize: 14, marginBottom: 24, padding: 0,
      }}>← Back</button>

      {/* Mission header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>{mission.icon}</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", margin: 0 }}>{mission.title}</h1>
        <p style={{ color: "var(--text-muted)", margin: "8px 0 0", fontSize: 15 }}>{mission.description}</p>
      </div>

      {/* Error */}
      {error && <div style={{ marginBottom: 24 }}><SafeErrorMessage message={error} onRetry={() => setError(null)} /></div>}

      {/* Mission complete */}
      {progress?.completed && !showCelebration ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 56 }}>🏆</div>
          <h2 style={{ color: "var(--text)", fontWeight: 800, marginBottom: 8 }}>Mission Complete!</h2>
          <div style={{ display: "flex", gap: 2, justifyContent: "center", margin: "12px 0" }}>
            {Array.from({ length: progress.stars }).map((_, i) => (
              <span key={i} style={{ fontSize: 28 }}>⭐</span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
            <button onClick={() => {
              // Reset mission for redo
              startMission(id);
              setLastPrompt("");
              setStylePrefix("");
              setArtifacts([]);
              setError(null);
              rerender();
            }} style={{
              background: "rgba(255,255,255,0.08)", color: "var(--text)", border: "2px solid rgba(255,255,255,0.15)",
              borderRadius: 12, padding: "14px 28px", fontWeight: 700, cursor: "pointer", fontSize: 15,
            }}>🔄 Play Again</button>
            <button onClick={() => router.push("/")} style={{
              background: "var(--accent)", color: "#fff", border: "none",
              borderRadius: 12, padding: "14px 28px", fontWeight: 700, cursor: "pointer", fontSize: 15,
            }}>Pick Another Mission →</button>
          </div>
        </div>
      ) : currentStep && currentStep.type !== "celebrate" ? (
        <StepGuide
          step={currentStep}
          stepNumber={stepNumber}
          totalSteps={mission.steps.length}
          onSubmit={handleStepSubmit}
          onSkip={() => { advanceToNextStep(id); rerender(); }}
          isLoading={isLoading}
          lastArtifactUrl={lastArtifactUrl}
        />
      ) : null}

      {/* Creations — BIG filmstrip with save buttons */}
      {artifacts.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h3 style={{ color: "var(--text-muted)", fontWeight: 700, marginBottom: 16, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Your Creations ({artifacts.length}) — tap ❤️ to save favorites
          </h3>
          <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 12 }}>
            {artifacts.map((a) => (
              <ArtifactPreview key={a.id} artifact={a} missionId={id} />
            ))}
          </div>
        </div>
      )}

      {/* Celebration */}
      {showCelebration && (
        <CelebrationOverlay
          stars={mission.maxStars}
          onDone={() => {
            setShowCelebration(false);
            completeMission(id, mission.maxStars);
            router.push("/");
          }}
        />
      )}
    </div>
  );
}

/** Individual artifact card with save-to-gallery button */
function ArtifactPreview({ artifact, missionId }: { artifact: Artifact; missionId: string }) {
  const [saved, setSaved] = useState(false);
  const { saveCreation } = useProgressStore();

  const handleSave = () => {
    saveCreation(missionId, {
      id: artifact.id,
      url: artifact.url,
      type: artifact.type,
      prompt: artifact.prompt,
      savedAt: Date.now(),
    });
    setSaved(true);
  };

  return (
    <div style={{
      flexShrink: 0, width: 320, borderRadius: 16,
      overflow: "hidden", border: "2px solid rgba(255,255,255,0.1)",
      background: "var(--bg-card)", boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
      position: "relative",
    }}>
      {artifact.type === "video" ? (
        <video src={artifact.url} controls autoPlay loop muted playsInline style={{ width: "100%", display: "block", aspectRatio: "1" }} />
      ) : artifact.type === "audio" ? (
        <div style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎵</div>
          <audio src={artifact.url} controls style={{ width: "100%" }} />
        </div>
      ) : (
        <img src={artifact.url} alt="creation" style={{ width: "100%", display: "block", aspectRatio: "1", objectFit: "cover" }} />
      )}
      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saved}
        style={{
          position: "absolute", top: 8, right: 8,
          background: saved ? "rgba(78,204,163,0.9)" : "rgba(0,0,0,0.6)",
          border: "none", borderRadius: 20,
          padding: "6px 12px", cursor: saved ? "default" : "pointer",
          fontSize: 14, color: "#fff", fontWeight: 600,
          backdropFilter: "blur(8px)",
        }}
      >
        {saved ? "✅ Saved" : "❤️ Save"}
      </button>
    </div>
  );
}
