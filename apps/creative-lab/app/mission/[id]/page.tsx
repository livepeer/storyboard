"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getMission } from "../../../lib/missions/catalog";
import { safePrompt, friendlyError } from "../../../lib/missions/safety";
import { startMission, getCurrentStep, advanceToNextStep } from "../../../lib/missions/engine";
import { useProgressStore } from "../../../lib/stores/progress-store";
import { StepGuide } from "../../../components/StepGuide";
import { CelebrationOverlay } from "../../../components/CelebrationOverlay";
import { SafeErrorMessage } from "../../../components/SafeErrorMessage";

interface Artifact {
  id: string;
  url: string;
  prompt: string;
}

// Simple in-component artifact store (no external dependency needed)
function createArtifactStore() {
  const items: Artifact[] = [];
  return {
    add(artifact: Artifact) {
      items.push(artifact);
    },
    getAll() {
      return [...items];
    },
  };
}

export default function MissionPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const mission = getMission(id);
  const { getProgress, addArtifact, completeMission } = useProgressStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastPrompt, setLastPrompt] = useState("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [artifactStore] = useState(() => createArtifactStore());

  // Force re-render on progress change
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  // Auto-start mission on first visit
  useEffect(() => {
    if (!mission) return;
    try {
      startMission(id);
      rerender();
    } catch {
      // Already started or locked — ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!mission) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Mission not found.</p>
        <button
          onClick={() => router.push("/")}
          style={{ marginTop: "16px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
        >
          ← Back to missions
        </button>
      </div>
    );
  }

  const progress = getProgress(id);
  const currentStep = getCurrentStep(id);
  const stepNumber = (progress?.currentStep ?? 0) + 1;
  const totalSteps = mission.steps.length;
  const missionComplete = progress?.completed ?? false;

  async function handleStepSubmit(input: string) {
    if (!currentStep) return;
    setError(null);

    try {
      if (currentStep.type === "text_input") {
        setLastPrompt(input);
        advanceToNextStep(id);
        rerender();
        return;
      }

      if (currentStep.type === "generate" || currentStep.type === "transform") {
        setIsLoading(true);
        const prompt = safePrompt(
          input || lastPrompt,
          currentStep.autoPromptPrefix
        );
        const capability = currentStep.capability || "flux-dev";

        try {
          // Call the SDK inference endpoint (same API storyboard uses).
          // Reads SDK URL + API key from localStorage (shared with storyboard).
          const sdkUrl = (typeof window !== "undefined" && localStorage.getItem("sdk_service_url")) || "https://sdk.daydream.monster";
          const apiKey = (typeof window !== "undefined" && localStorage.getItem("sdk_api_key")) || "";

          const resp = await fetch(`${sdkUrl}/inference`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify({ capability, prompt, params: {} }),
          });

          if (!resp.ok) {
            const errText = await resp.text().catch(() => "");
            throw new Error(errText.slice(0, 200) || `HTTP ${resp.status}`);
          }

          const result = await resp.json();
          const data = (result.data ?? result) as Record<string, unknown>;
          const images = data.images as Array<{ url: string }> | undefined;
          const image = data.image as { url: string } | undefined;
          const url =
            (result.image_url as string) ??
            images?.[0]?.url ??
            image?.url ??
            (data.url as string);

          if (!url) throw new Error("No image returned");

          const artifact: Artifact = {
            id: `artifact-${Date.now()}`,
            url,
            prompt,
          };
          artifactStore.add(artifact);
          addArtifact(id, artifact.id);
          setArtifacts(artifactStore.getAll());
          advanceToNextStep(id);
          rerender();
        } catch (e) {
          setError(friendlyError(e instanceof Error ? e.message : "unknown"));
        } finally {
          setIsLoading(false);
        }
        return;
      }

      if (currentStep.type === "review") {
        advanceToNextStep(id);
        rerender();
        return;
      }

      if (currentStep.type === "celebrate") {
        setShowCelebration(true);
        return;
      }
    } catch (err) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : "Something went wrong!");
    }
  }

  // Auto-trigger celebrate step
  useEffect(() => {
    if (currentStep?.type === "celebrate") {
      setShowCelebration(true);
    }
  }, [currentStep?.type]);

  function handleCelebrationDone() {
    setShowCelebration(false);
    completeMission(id, mission?.maxStars ?? 3);
    router.push("/");
  }

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", padding: "32px 16px" }}>
      {/* Back button */}
      <button
        onClick={() => router.push("/")}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: "0.9rem",
          marginBottom: "24px",
          padding: 0,
        }}
      >
        ← Back
      </button>

      {/* Mission header */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <div style={{ fontSize: "3rem", marginBottom: "8px" }}>{mission.icon}</div>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text)", margin: 0 }}>
          {mission.title}
        </h1>
      </div>

      {/* Error display */}
      {error && (
        <div style={{ marginBottom: "24px" }}>
          <SafeErrorMessage message={error} onRetry={() => setError(null)} />
        </div>
      )}

      {/* Mission complete */}
      {missionComplete && !showCelebration ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: "3rem", marginBottom: "12px" }}>🏆</div>
          <h2 style={{ color: "var(--text)", fontWeight: 800, marginBottom: "8px" }}>Mission Complete!</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "24px" }}>
            You earned {mission.maxStars} star{mission.maxStars !== 1 ? "s" : ""}!
          </p>
          <button
            onClick={() => router.push("/")}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              padding: "12px 28px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            Pick Another Mission →
          </button>
        </div>
      ) : currentStep && currentStep.type !== "celebrate" ? (
        <StepGuide
          step={currentStep}
          stepNumber={stepNumber}
          totalSteps={totalSteps}
          onSubmit={handleStepSubmit}
          isLoading={isLoading}
        />
      ) : null}

      {/* Artifacts grid */}
      {artifacts.length > 0 && (
        <div style={{ marginTop: "40px" }}>
          <h3 style={{ color: "var(--text-muted)", fontWeight: 700, marginBottom: "12px", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Your Creations
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "12px",
            }}
          >
            {artifacts.map((a) => (
              <div
                key={a.id}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  overflow: "hidden",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt="creation" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Celebration overlay */}
      {showCelebration && (
        <CelebrationOverlay
          stars={mission.maxStars}
          onDone={handleCelebrationDone}
        />
      )}
    </div>
  );
}
