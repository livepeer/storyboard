module.exports = [
"[project]/apps/creative-lab/lib/missions/catalog.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MISSIONS",
    ()=>MISSIONS,
    "getMission",
    ()=>getMission
]);
const MISSIONS = [
    {
        id: "dream-pet",
        title: "My Dream Pet",
        description: "Imagine and create your perfect fantasy pet!",
        icon: "🐾",
        difficulty: "starter",
        category: "image",
        maxStars: 3,
        steps: [
            {
                id: "describe",
                type: "text_input",
                instruction: "What does your dream pet look like? Describe its colors, size, and any magical features!",
                hint: "Think about what makes your pet special — maybe it has wings, glows in the dark, or has rainbow fur!"
            },
            {
                id: "generate",
                type: "generate",
                instruction: "Let's bring your dream pet to life!",
                hint: "The AI will paint your pet based on your description.",
                capability: "flux-dev",
                autoPromptPrefix: "cute child-friendly cartoon illustration, colorful, friendly, "
            },
            {
                id: "review",
                type: "review",
                instruction: "Take a look at your dream pet! Do you love it?",
                hint: "You can go back and try again with a different description if you want."
            },
            {
                id: "celebrate",
                type: "celebrate",
                instruction: "Amazing! You created your dream pet! 🎉"
            }
        ]
    },
    {
        id: "superhero",
        title: "Superhero Portrait",
        description: "Design your own superhero and give them an epic power effect!",
        icon: "🦸",
        difficulty: "starter",
        category: "image",
        maxStars: 3,
        steps: [
            {
                id: "describe",
                type: "text_input",
                instruction: "Describe your superhero! What do they look like? What's their costume like?",
                hint: "Think about colors, a cool mask, a cape, or any special details that make them unique!"
            },
            {
                id: "generate",
                type: "generate",
                instruction: "Time to create your superhero!",
                hint: "The AI will draw your hero in an epic pose.",
                capability: "flux-dev",
                autoPromptPrefix: "epic superhero portrait, child-friendly cartoon style, dynamic pose, bright colors, "
            },
            {
                id: "transform",
                type: "transform",
                instruction: "Add an epic power effect to your superhero!",
                hint: "Try: 'add lightning bolts', 'surround with flames', 'add glowing energy aura'",
                capability: "kontext-edit",
                action: "restyle"
            },
            {
                id: "celebrate",
                type: "celebrate",
                instruction: "Your superhero is ready to save the day! 🦸‍♀️💥"
            }
        ]
    },
    {
        id: "funny-animal",
        title: "Funny Animal Moment",
        description: "Create a hilarious cartoon of an animal in a silly situation!",
        icon: "🤣",
        difficulty: "starter",
        category: "image",
        maxStars: 3,
        steps: [
            {
                id: "describe",
                type: "text_input",
                instruction: "What animal is it and what funny thing are they doing?",
                hint: "Examples: 'a cat wearing sunglasses eating pizza', 'a dog trying to drive a rocket ship', 'a frog playing a tiny guitar'"
            },
            {
                id: "generate",
                type: "generate",
                instruction: "Let's make the funniest cartoon ever!",
                hint: "The AI will draw your silly animal scene.",
                capability: "flux-dev",
                autoPromptPrefix: "hilarious cartoon, child-friendly humor, vibrant colors, exaggerated expressions, "
            },
            {
                id: "celebrate",
                type: "celebrate",
                instruction: "Ha! That's hilarious! You're a comedy genius! 🤣🎨"
            }
        ]
    }
];
const MISSION_MAP = new Map(MISSIONS.map((m)=>[
        m.id,
        m
    ]));
function getMission(id) {
    return MISSION_MAP.get(id);
}
;
}),
"[project]/apps/creative-lab/lib/missions/safety.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "friendlyError",
    ()=>friendlyError,
    "isSafeCapability",
    ()=>isSafeCapability,
    "safePrompt",
    ()=>safePrompt
]);
const SAFE_MODELS = new Set([
    "flux-dev",
    "flux-schnell",
    "seedream-5-lite",
    "recraft-v4",
    "kontext-edit",
    "chatterbox-tts",
    "ltx-i2v",
    "bg-remove",
    "topaz-upscale"
]);
const SAFETY_PREFIX = "child-friendly, colorful, cartoon style, safe for all ages, ";
function isSafeCapability(capability) {
    return SAFE_MODELS.has(capability);
}
function safePrompt(userPrompt, autoPrefix) {
    const prefix = autoPrefix ?? SAFETY_PREFIX;
    return `${prefix}${userPrompt}`;
}
function friendlyError(rawError) {
    const lower = rawError.toLowerCase();
    if (lower.includes("content") || lower.includes("policy") || lower.includes("safety")) {
        return "Hmm, let\u2019s try describing it differently! \uD83E\uDD14";
    }
    if (lower.includes("orchestrator") || lower.includes("capacity") || lower.includes("503") || lower.includes("no gpu") || lower.includes("unavailable")) {
        return "The AI is busy right now. Try again in a moment! \u23F3";
    }
    if (lower.includes("network") || lower.includes("fetch") || lower.includes("timeout") || lower.includes("econnrefused") || lower.includes("failed to fetch")) {
        return "Check your internet connection and try again! \uD83C\uDF10";
    }
    if (lower.includes("401") || lower.includes("auth") || lower.includes("key") || lower.includes("unauthorized")) {
        return "Oops! Ask a grown-up to check the settings. \uD83D\uDD11";
    }
    return "Something went wrong. Let\u2019s try again! \uD83D\uDD04";
}
}),
"[project]/apps/creative-lab/lib/stores/progress-store.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useProgressStore",
    ()=>useProgressStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/zustand@5.0.12+26a211c426f3f87c/node_modules/zustand/esm/react.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/zustand@5.0.12+26a211c426f3f87c/node_modules/zustand/esm/middleware.mjs [app-ssr] (ecmascript)");
;
;
const useProgressStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["create"])()((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["persist"])((set, get)=>({
        progress: [],
        totalStars: 0,
        startMission: (missionId)=>{
            const now = Date.now();
            set((state)=>{
                const existing = state.progress.find((p)=>p.missionId === missionId);
                let newProgress;
                if (existing) {
                    // Reset progress for this mission
                    newProgress = state.progress.map((p)=>p.missionId === missionId ? {
                            ...p,
                            currentStep: 0,
                            completed: false,
                            stars: 0,
                            artifacts: [],
                            startedAt: now,
                            completedAt: undefined
                        } : p);
                } else {
                    newProgress = [
                        ...state.progress,
                        {
                            missionId,
                            currentStep: 0,
                            completed: false,
                            stars: 0,
                            artifacts: [],
                            startedAt: now
                        }
                    ];
                }
                return {
                    progress: newProgress
                };
            });
        },
        advanceStep: (missionId)=>{
            set((state)=>({
                    progress: state.progress.map((p)=>p.missionId === missionId ? {
                            ...p,
                            currentStep: p.currentStep + 1
                        } : p)
                }));
        },
        completeMission: (missionId, stars)=>{
            set((state)=>{
                const newProgress = state.progress.map((p)=>{
                    if (p.missionId !== missionId) return p;
                    return {
                        ...p,
                        completed: true,
                        stars: Math.max(p.stars, stars),
                        completedAt: Date.now()
                    };
                });
                const totalStars = newProgress.reduce((sum, p)=>sum + p.stars, 0);
                return {
                    progress: newProgress,
                    totalStars
                };
            });
        },
        addArtifact: (missionId, artifactRefId)=>{
            set((state)=>({
                    progress: state.progress.map((p)=>p.missionId === missionId ? {
                            ...p,
                            artifacts: [
                                ...p.artifacts,
                                artifactRefId
                            ]
                        } : p)
                }));
        },
        getProgress: (missionId)=>{
            return get().progress.find((p)=>p.missionId === missionId);
        },
        isMissionUnlocked: (missionId, unlockAfter)=>{
            if (!unlockAfter || unlockAfter.length === 0) return true;
            const { progress } = get();
            return unlockAfter.every((prerequisiteId)=>progress.some((p)=>p.missionId === prerequisiteId && p.completed));
        }
    }), {
    name: "creative-lab:progress"
}));
}),
"[project]/apps/creative-lab/lib/missions/engine.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "advanceToNextStep",
    ()=>advanceToNextStep,
    "getCurrentStep",
    ()=>getCurrentStep,
    "startMission",
    ()=>startMission
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/missions/catalog.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/stores/progress-store.ts [app-ssr] (ecmascript)");
;
;
function startMission(missionId) {
    const mission = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getMission"])(missionId);
    if (!mission) {
        throw new Error(`Mission not found: ${missionId}`);
    }
    const { isMissionUnlocked, startMission: storeStartMission } = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useProgressStore"].getState();
    if (!isMissionUnlocked(missionId, mission.unlockAfter)) {
        throw new Error(`Mission "${missionId}" is locked. Complete prerequisites first.`);
    }
    storeStartMission(missionId);
}
function getCurrentStep(missionId) {
    const mission = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getMission"])(missionId);
    if (!mission) return null;
    const { getProgress } = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useProgressStore"].getState();
    const progress = getProgress(missionId);
    if (!progress) return null;
    const step = mission.steps[progress.currentStep];
    return step ?? null;
}
function advanceToNextStep(missionId) {
    const mission = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getMission"])(missionId);
    if (!mission) return null;
    const { advanceStep, completeMission, getProgress } = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useProgressStore"].getState();
    const progress = getProgress(missionId);
    if (!progress) return null;
    const nextStepIndex = progress.currentStep + 1;
    if (nextStepIndex >= mission.steps.length) {
        // Mission complete — award max stars
        completeMission(missionId, mission.maxStars);
        return null;
    }
    advanceStep(missionId);
    return mission.steps[nextStepIndex];
}
}),
"[project]/apps/creative-lab/components/StepGuide.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "StepGuide",
    ()=>StepGuide
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
function StepGuide({ step, stepNumber, totalSteps, onSubmit, isLoading = false }) {
    const [inputValue, setInputValue] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [showHint, setShowHint] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    function handleTextSubmit() {
        if (inputValue.trim()) {
            onSubmit(inputValue.trim());
            setInputValue("");
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            maxWidth: "560px",
            margin: "0 auto",
            padding: "0 16px"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "flex",
                    justifyContent: "center",
                    gap: "8px",
                    marginBottom: "28px"
                },
                children: Array.from({
                    length: totalSteps
                }).map((_, i)=>{
                    const isDone = i < stepNumber - 1;
                    const isCurrent = i === stepNumber - 1;
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            width: "12px",
                            height: "12px",
                            borderRadius: "50%",
                            background: isDone ? "#4ecca3" : isCurrent ? "#e94560" : "var(--text-dim)",
                            transition: "background 0.2s"
                        }
                    }, i, false, {
                        fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
                        lineNumber: 33,
                        columnNumber: 13
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
                lineNumber: 28,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                style: {
                    fontSize: "1.25rem",
                    fontWeight: 700,
                    color: "var(--text)",
                    textAlign: "center",
                    marginBottom: "24px",
                    lineHeight: 1.4
                },
                children: step.instruction
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
                lineNumber: 48,
                columnNumber: 7
            }, this),
            step.hint && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    textAlign: "center",
                    marginBottom: "20px"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setShowHint((v)=>!v),
                        style: {
                            background: "none",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            fontSize: "0.9rem",
                            fontWeight: 600,
                            textDecoration: "underline"
                        },
                        children: "Need a hint? 💡"
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
                        lineNumber: 64,
                        columnNumber: 11
                    }, this),
                    showHint && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            background: "#451a03",
                            border: "1px solid #92400e",
                            borderRadius: "10px",
                            padding: "12px 16px",
                            marginTop: "10px",
                            color: "#fcd34d",
                            fontSize: "0.9rem",
                            lineHeight: 1.5
                        },
                        children: step.hint
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
                        lineNumber: 79,
                        columnNumber: 13
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
                lineNumber: 63,
                columnNumber: 9
            }, this),
            (step.type === "text_input" || step.type === "transform") && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                        value: inputValue,
                        onChange: (e)=>setInputValue(e.target.value),
                        placeholder: "Type your answer here…",
                        rows: 3,
                        style: {
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                            borderRadius: "10px",
                            padding: "12px",
                            color: "var(--text)",
                            fontSize: "1rem",
                            resize: "vertical",
                            outline: "none",
                            width: "100%",
                            boxSizing: "border-box"
                        },
                        onKeyDown: (e)=>{
                            if (e.key === "Enter" && e.ctrlKey) handleTextSubmit();
                        }
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
                        lineNumber: 100,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: handleTextSubmit,
                        disabled: isLoading || !inputValue.trim(),
                        style: {
                            background: "var(--accent)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "10px",
                            padding: "12px 28px",
                            fontSize: "1rem",
                            fontWeight: 700,
                            cursor: isLoading || !inputValue.trim() ? "not-allowed" : "pointer",
                            opacity: isLoading || !inputValue.trim() ? 0.6 : 1,
                            transition: "opacity 0.15s",
                            alignSelf: "center"
                        },
                        children: isLoading ? "Creating… ✨" : "Go! ✨"
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
                        lineNumber: 121,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
                lineNumber: 99,
                columnNumber: 9
            }, this),
            step.type === "generate" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    textAlign: "center"
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    onClick: ()=>onSubmit(""),
                    disabled: isLoading,
                    style: {
                        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "14px",
                        padding: "16px 40px",
                        fontSize: "1.2rem",
                        fontWeight: 700,
                        cursor: isLoading ? "not-allowed" : "pointer",
                        opacity: isLoading ? 0.7 : 1,
                        transition: "opacity 0.15s, transform 0.15s",
                        boxShadow: "0 4px 20px rgba(102,126,234,0.4)"
                    },
                    children: isLoading ? "Creating… ✨" : "Make it! 🎨"
                }, void 0, false, {
                    fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
                    lineNumber: 145,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
                lineNumber: 144,
                columnNumber: 9
            }, this),
            step.type === "review" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    textAlign: "center"
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    onClick: ()=>onSubmit(""),
                    disabled: isLoading,
                    style: {
                        background: "#166534",
                        color: "#86efac",
                        border: "none",
                        borderRadius: "10px",
                        padding: "12px 32px",
                        fontSize: "1rem",
                        fontWeight: 700,
                        cursor: "pointer"
                    },
                    children: "Looks great! Next →"
                }, void 0, false, {
                    fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
                    lineNumber: 169,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
                lineNumber: 168,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/creative-lab/components/StepGuide.tsx",
        lineNumber: 26,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/creative-lab/components/CelebrationOverlay.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CelebrationOverlay",
    ()=>CelebrationOverlay
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
const CONFETTI_EMOJI = [
    "🎉",
    "🌟",
    "✨",
    "🎊",
    "💫",
    "🎯",
    "🏆"
];
function CelebrationOverlay({ stars, onDone }) {
    // Auto-dismiss after 4 seconds
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const timer = setTimeout(onDone, 4000);
        return ()=>clearTimeout(timer);
    }, [
        onDone
    ]);
    const particles = Array.from({
        length: 20
    }).map((_, i)=>({
            emoji: CONFETTI_EMOJI[i % CONFETTI_EMOJI.length],
            left: `${Math.floor(i / 20 * 100)}%`,
            delay: `${(i * 0.1).toFixed(1)}s`,
            duration: `${1.5 + i % 5 * 0.3}s`
        }));
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            overflow: "hidden"
        },
        children: [
            particles.map((p, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    style: {
                        position: "absolute",
                        top: 0,
                        left: p.left,
                        fontSize: "1.75rem",
                        animation: `confetti-fall ${p.duration} ${p.delay} ease-in forwards`,
                        pointerEvents: "none"
                    },
                    children: p.emoji
                }, i, false, {
                    fileName: "[project]/apps/creative-lab/components/CelebrationOverlay.tsx",
                    lineNumber: 42,
                    columnNumber: 9
                }, this)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "20px",
                    padding: "40px 48px",
                    textAlign: "center",
                    maxWidth: "400px",
                    position: "relative",
                    zIndex: 1
                },
                className: "animate-bounce-in",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            fontSize: "3rem",
                            marginBottom: "12px"
                        },
                        children: "🎉"
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/components/CelebrationOverlay.tsx",
                        lineNumber: 71,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        style: {
                            fontSize: "2rem",
                            fontWeight: 800,
                            color: "var(--text)",
                            marginBottom: "20px"
                        },
                        children: "Amazing Work!"
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/components/CelebrationOverlay.tsx",
                        lineNumber: 72,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            display: "flex",
                            justifyContent: "center",
                            gap: "8px",
                            marginBottom: "28px"
                        },
                        children: Array.from({
                            length: stars
                        }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "animate-star-pop",
                                style: {
                                    fontSize: "2rem",
                                    animationDelay: `${i * 0.15}s`
                                },
                                children: "⭐"
                            }, i, false, {
                                fileName: "[project]/apps/creative-lab/components/CelebrationOverlay.tsx",
                                lineNumber: 86,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/components/CelebrationOverlay.tsx",
                        lineNumber: 84,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: onDone,
                        style: {
                            background: "var(--accent)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "10px",
                            padding: "12px 32px",
                            fontSize: "1rem",
                            fontWeight: 700,
                            cursor: "pointer"
                        },
                        children: "Continue →"
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/components/CelebrationOverlay.tsx",
                        lineNumber: 99,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/creative-lab/components/CelebrationOverlay.tsx",
                lineNumber: 58,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/creative-lab/components/CelebrationOverlay.tsx",
        lineNumber: 27,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/creative-lab/components/SafeErrorMessage.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SafeErrorMessage",
    ()=>SafeErrorMessage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
"use client";
;
function SafeErrorMessage({ message, onRetry }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            background: "#451a03",
            border: "1px solid #92400e",
            borderRadius: "12px",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            maxWidth: "480px",
            margin: "0 auto"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "10px"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            fontSize: "1.5rem"
                        },
                        children: "🤔"
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/components/SafeErrorMessage.tsx",
                        lineNumber: 24,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        style: {
                            color: "#fcd34d",
                            fontWeight: 600,
                            margin: 0
                        },
                        children: message
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/components/SafeErrorMessage.tsx",
                        lineNumber: 25,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/creative-lab/components/SafeErrorMessage.tsx",
                lineNumber: 23,
                columnNumber: 7
            }, this),
            onRetry && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: onRetry,
                style: {
                    alignSelf: "flex-start",
                    background: "#92400e",
                    color: "#fef3c7",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 16px",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: "0.9rem"
                },
                children: "Try Again 🔄"
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/components/SafeErrorMessage.tsx",
                lineNumber: 28,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/creative-lab/components/SafeErrorMessage.tsx",
        lineNumber: 10,
        columnNumber: 5
    }, this);
}
}),
"[project]/apps/creative-lab/app/mission/[id]/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>MissionPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/missions/catalog.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$safety$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/missions/safety.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$engine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/missions/engine.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/stores/progress-store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$StepGuide$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/components/StepGuide.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$CelebrationOverlay$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/components/CelebrationOverlay.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$SafeErrorMessage$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/components/SafeErrorMessage.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
;
;
// Simple in-component artifact store (no external dependency needed)
function createArtifactStore() {
    const items = [];
    return {
        add (artifact) {
            items.push(artifact);
        },
        getAll () {
            return [
                ...items
            ];
        }
    };
}
function MissionPage() {
    const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useParams"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
    const mission = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getMission"])(id);
    const { getProgress, addArtifact, completeMission } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useProgressStore"])();
    const [isLoading, setIsLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [showCelebration, setShowCelebration] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [lastPrompt, setLastPrompt] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [artifacts, setArtifacts] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [artifactStore] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>createArtifactStore());
    // Force re-render on progress change
    const [, setTick] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const rerender = ()=>setTick((t)=>t + 1);
    // Auto-start mission on first visit
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!mission) return;
        try {
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$engine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["startMission"])(id);
            rerender();
        } catch  {
        // Already started or locked — ignore
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        id
    ]);
    if (!mission) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            style: {
                padding: "40px",
                textAlign: "center"
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    style: {
                        color: "var(--text-muted)"
                    },
                    children: "Mission not found."
                }, void 0, false, {
                    fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                    lineNumber: 66,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    onClick: ()=>router.push("/"),
                    style: {
                        marginTop: "16px",
                        color: "var(--accent)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontWeight: 700
                    },
                    children: "← Back to missions"
                }, void 0, false, {
                    fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                    lineNumber: 67,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
            lineNumber: 65,
            columnNumber: 7
        }, this);
    }
    const progress = getProgress(id);
    const currentStep = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$engine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCurrentStep"])(id);
    const stepNumber = (progress?.currentStep ?? 0) + 1;
    const totalSteps = mission.steps.length;
    const missionComplete = progress?.completed ?? false;
    async function handleStepSubmit(input) {
        if (!currentStep) return;
        setError(null);
        try {
            if (currentStep.type === "text_input") {
                setLastPrompt(input);
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$engine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["advanceToNextStep"])(id);
                rerender();
                return;
            }
            if (currentStep.type === "generate" || currentStep.type === "transform") {
                setIsLoading(true);
                const prompt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$safety$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["safePrompt"])(input || lastPrompt, currentStep.autoPromptPrefix);
                const capability = currentStep.capability || "flux-dev";
                try {
                    // Call the SDK inference endpoint (same API storyboard uses).
                    // Reads SDK URL + API key from localStorage (shared with storyboard).
                    const sdkUrl = ("TURBOPACK compile-time value", "undefined") !== "undefined" && localStorage.getItem("sdk_service_url") || "https://sdk.daydream.monster";
                    const apiKey = ("TURBOPACK compile-time value", "undefined") !== "undefined" && localStorage.getItem("sdk_api_key") || "";
                    const resp = await fetch(`${sdkUrl}/inference`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            ...("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : {}
                        },
                        body: JSON.stringify({
                            capability,
                            prompt,
                            params: {}
                        })
                    });
                    if (!resp.ok) {
                        const errText = await resp.text().catch(()=>"");
                        throw new Error(errText.slice(0, 200) || `HTTP ${resp.status}`);
                    }
                    const result = await resp.json();
                    const data = result.data ?? result;
                    const images = data.images;
                    const image = data.image;
                    const url = result.image_url ?? images?.[0]?.url ?? image?.url ?? data.url;
                    if (!url) throw new Error("No image returned");
                    const artifact = {
                        id: `artifact-${Date.now()}`,
                        url,
                        prompt
                    };
                    artifactStore.add(artifact);
                    addArtifact(id, artifact.id);
                    setArtifacts(artifactStore.getAll());
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$engine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["advanceToNextStep"])(id);
                    rerender();
                } catch (e) {
                    setError((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$safety$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["friendlyError"])(e instanceof Error ? e.message : "unknown"));
                } finally{
                    setIsLoading(false);
                }
                return;
            }
            if (currentStep.type === "review") {
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$engine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["advanceToNextStep"])(id);
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
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (currentStep?.type === "celebrate") {
            setShowCelebration(true);
        }
    }, [
        currentStep?.type
    ]);
    function handleCelebrationDone() {
        setShowCelebration(false);
        completeMission(id, mission?.maxStars ?? 3);
        router.push("/");
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            maxWidth: "640px",
            margin: "0 auto",
            padding: "32px 16px"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: ()=>router.push("/"),
                style: {
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    marginBottom: "24px",
                    padding: 0
                },
                children: "← Back"
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                lineNumber: 185,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    textAlign: "center",
                    marginBottom: "32px"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            fontSize: "3rem",
                            marginBottom: "8px"
                        },
                        children: mission.icon
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                        lineNumber: 203,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        style: {
                            fontSize: "1.6rem",
                            fontWeight: 800,
                            color: "var(--text)",
                            margin: 0
                        },
                        children: mission.title
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                        lineNumber: 204,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                lineNumber: 202,
                columnNumber: 7
            }, this),
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    marginBottom: "24px"
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$SafeErrorMessage$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SafeErrorMessage"], {
                    message: error,
                    onRetry: ()=>setError(null)
                }, void 0, false, {
                    fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                    lineNumber: 212,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                lineNumber: 211,
                columnNumber: 9
            }, this),
            missionComplete && !showCelebration ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    textAlign: "center",
                    padding: "40px 0"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            fontSize: "3rem",
                            marginBottom: "12px"
                        },
                        children: "🏆"
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                        lineNumber: 219,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        style: {
                            color: "var(--text)",
                            fontWeight: 800,
                            marginBottom: "8px"
                        },
                        children: "Mission Complete!"
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                        lineNumber: 220,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        style: {
                            color: "var(--text-muted)",
                            marginBottom: "24px"
                        },
                        children: [
                            "You earned ",
                            mission.maxStars,
                            " star",
                            mission.maxStars !== 1 ? "s" : "",
                            "!"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                        lineNumber: 221,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>router.push("/"),
                        style: {
                            background: "var(--accent)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "10px",
                            padding: "12px 28px",
                            fontWeight: 700,
                            cursor: "pointer",
                            fontSize: "1rem"
                        },
                        children: "Pick Another Mission →"
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                        lineNumber: 224,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                lineNumber: 218,
                columnNumber: 9
            }, this) : currentStep && currentStep.type !== "celebrate" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$StepGuide$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["StepGuide"], {
                step: currentStep,
                stepNumber: stepNumber,
                totalSteps: totalSteps,
                onSubmit: handleStepSubmit,
                isLoading: isLoading
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                lineNumber: 241,
                columnNumber: 9
            }, this) : null,
            artifacts.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    marginTop: "40px"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        style: {
                            color: "var(--text-muted)",
                            fontWeight: 700,
                            marginBottom: "12px",
                            fontSize: "0.9rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em"
                        },
                        children: "Your Creations"
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                        lineNumber: 253,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                            gap: "12px"
                        },
                        children: artifacts.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    background: "var(--bg-card)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "10px",
                                    overflow: "hidden"
                                },
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                    src: a.url,
                                    alt: "creation",
                                    style: {
                                        width: "100%",
                                        aspectRatio: "1",
                                        objectFit: "cover",
                                        display: "block"
                                    }
                                }, void 0, false, {
                                    fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                                    lineNumber: 274,
                                    columnNumber: 17
                                }, this)
                            }, a.id, false, {
                                fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                                lineNumber: 264,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                        lineNumber: 256,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                lineNumber: 252,
                columnNumber: 9
            }, this),
            showCelebration && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$CelebrationOverlay$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CelebrationOverlay"], {
                stars: mission.maxStars,
                onDone: handleCelebrationDone
            }, void 0, false, {
                fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                lineNumber: 283,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
        lineNumber: 183,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=apps_creative-lab_0f4_e_o._.js.map