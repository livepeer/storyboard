(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/apps/creative-lab/lib/missions/catalog.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/creative-lab/lib/missions/safety.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/creative-lab/lib/stores/progress-store.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useProgressStore",
    ()=>useProgressStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/zustand@5.0.12+26a211c426f3f87c/node_modules/zustand/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/zustand@5.0.12+26a211c426f3f87c/node_modules/zustand/esm/middleware.mjs [app-client] (ecmascript)");
;
;
const useProgressStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["create"])()((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["persist"])((set, get)=>({
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/creative-lab/lib/missions/engine.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "advanceToNextStep",
    ()=>advanceToNextStep,
    "getCurrentStep",
    ()=>getCurrentStep,
    "startMission",
    ()=>startMission
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/missions/catalog.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/stores/progress-store.ts [app-client] (ecmascript)");
;
;
function startMission(missionId) {
    const mission = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getMission"])(missionId);
    if (!mission) {
        throw new Error(`Mission not found: ${missionId}`);
    }
    const { isMissionUnlocked, startMission: storeStartMission } = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useProgressStore"].getState();
    if (!isMissionUnlocked(missionId, mission.unlockAfter)) {
        throw new Error(`Mission "${missionId}" is locked. Complete prerequisites first.`);
    }
    storeStartMission(missionId);
}
function getCurrentStep(missionId) {
    const mission = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getMission"])(missionId);
    if (!mission) return null;
    const { getProgress } = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useProgressStore"].getState();
    const progress = getProgress(missionId);
    if (!progress) return null;
    const step = mission.steps[progress.currentStep];
    return step ?? null;
}
function advanceToNextStep(missionId) {
    const mission = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getMission"])(missionId);
    if (!mission) return null;
    const { advanceStep, completeMission, getProgress } = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useProgressStore"].getState();
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/creative-lab/components/StepGuide.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "StepGuide",
    ()=>StepGuide
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
function StepGuide({ step, stepNumber, totalSteps, onSubmit, isLoading = false }) {
    _s();
    const [inputValue, setInputValue] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [showHint, setShowHint] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    function handleTextSubmit() {
        if (inputValue.trim()) {
            onSubmit(inputValue.trim());
            setInputValue("");
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            maxWidth: "560px",
            margin: "0 auto",
            padding: "0 16px"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
            step.hint && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    textAlign: "center",
                    marginBottom: "20px"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                    showHint && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
            (step.type === "text_input" || step.type === "transform") && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
            step.type === "generate" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    textAlign: "center"
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
            step.type === "review" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    textAlign: "center"
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
_s(StepGuide, "/QqA62uzXQPS27pXUKFe35m7eLk=");
_c = StepGuide;
var _c;
__turbopack_context__.k.register(_c, "StepGuide");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/creative-lab/components/CelebrationOverlay.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CelebrationOverlay",
    ()=>CelebrationOverlay
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
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
    _s();
    // Auto-dismiss after 4 seconds
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "CelebrationOverlay.useEffect": ()=>{
            const timer = setTimeout(onDone, 4000);
            return ({
                "CelebrationOverlay.useEffect": ()=>clearTimeout(timer)
            })["CelebrationOverlay.useEffect"];
        }
    }["CelebrationOverlay.useEffect"], [
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
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
            particles.map((p, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            display: "flex",
                            justifyContent: "center",
                            gap: "8px",
                            marginBottom: "28px"
                        },
                        children: Array.from({
                            length: stars
                        }).map((_, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
_s(CelebrationOverlay, "OD7bBpZva5O2jO+Puf00hKivP7c=");
_c = CelebrationOverlay;
var _c;
__turbopack_context__.k.register(_c, "CelebrationOverlay");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/creative-lab/components/SafeErrorMessage.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SafeErrorMessage",
    ()=>SafeErrorMessage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
"use client";
;
function SafeErrorMessage({ message, onRetry }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "10px"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            fontSize: "1.5rem"
                        },
                        children: "🤔"
                    }, void 0, false, {
                        fileName: "[project]/apps/creative-lab/components/SafeErrorMessage.tsx",
                        lineNumber: 24,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
            onRetry && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
_c = SafeErrorMessage;
var _c;
__turbopack_context__.k.register(_c, "SafeErrorMessage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/creative-lab/app/mission/[id]/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>MissionPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/missions/catalog.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$safety$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/missions/safety.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/missions/engine.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/lib/stores/progress-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$StepGuide$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/components/StepGuide.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$CelebrationOverlay$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/components/CelebrationOverlay.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$SafeErrorMessage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/creative-lab/components/SafeErrorMessage.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
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
    _s();
    const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
    const mission = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$catalog$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getMission"])(id);
    const { getProgress, addArtifact, completeMission } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useProgressStore"])();
    const [isLoading, setIsLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [showCelebration, setShowCelebration] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [lastPrompt, setLastPrompt] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [artifacts, setArtifacts] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [artifactStore] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "MissionPage.useState": ()=>createArtifactStore()
    }["MissionPage.useState"]);
    // Force re-render on progress change
    const [, setTick] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const rerender = ()=>setTick((t)=>t + 1);
    // Auto-start mission on first visit
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MissionPage.useEffect": ()=>{
            if (!mission) return;
            try {
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["startMission"])(id);
                rerender();
            } catch  {
            // Already started or locked — ignore
            }
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }
    }["MissionPage.useEffect"], [
        id
    ]);
    if (!mission) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            style: {
                padding: "40px",
                textAlign: "center"
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    style: {
                        color: "var(--text-muted)"
                    },
                    children: "Mission not found."
                }, void 0, false, {
                    fileName: "[project]/apps/creative-lab/app/mission/[id]/page.tsx",
                    lineNumber: 66,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
    const currentStep = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getCurrentStep"])(id);
    const stepNumber = (progress?.currentStep ?? 0) + 1;
    const totalSteps = mission.steps.length;
    const missionComplete = progress?.completed ?? false;
    async function handleStepSubmit(input) {
        if (!currentStep) return;
        setError(null);
        try {
            if (currentStep.type === "text_input") {
                setLastPrompt(input);
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["advanceToNextStep"])(id);
                rerender();
                return;
            }
            if (currentStep.type === "generate" || currentStep.type === "transform") {
                setIsLoading(true);
                const prompt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$safety$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["safePrompt"])(input || lastPrompt, currentStep.autoPromptPrefix);
                const capability = currentStep.capability || "flux-dev";
                try {
                    // Call the SDK inference endpoint (same API storyboard uses).
                    // Reads SDK URL + API key from localStorage (shared with storyboard).
                    const sdkUrl = ("TURBOPACK compile-time value", "object") !== "undefined" && localStorage.getItem("sdk_service_url") || "https://sdk.daydream.monster";
                    const apiKey = ("TURBOPACK compile-time value", "object") !== "undefined" && localStorage.getItem("sdk_api_key") || "";
                    const resp = await fetch(`${sdkUrl}/inference`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            ...apiKey ? {
                                Authorization: `Bearer ${apiKey}`
                            } : {}
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
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["advanceToNextStep"])(id);
                    rerender();
                } catch (e) {
                    setError((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$safety$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["friendlyError"])(e instanceof Error ? e.message : "unknown"));
                } finally{
                    setIsLoading(false);
                }
                return;
            }
            if (currentStep.type === "review") {
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$missions$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["advanceToNextStep"])(id);
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
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MissionPage.useEffect": ()=>{
            if (currentStep?.type === "celebrate") {
                setShowCelebration(true);
            }
        }
    }["MissionPage.useEffect"], [
        currentStep?.type
    ]);
    function handleCelebrationDone() {
        setShowCelebration(false);
        completeMission(id, mission?.maxStars ?? 3);
        router.push("/");
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            maxWidth: "640px",
            margin: "0 auto",
            padding: "32px 16px"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    textAlign: "center",
                    marginBottom: "32px"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
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
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    marginBottom: "24px"
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$SafeErrorMessage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SafeErrorMessage"], {
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
            missionComplete && !showCelebration ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    textAlign: "center",
                    padding: "40px 0"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
            }, this) : currentStep && currentStep.type !== "celebrate" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$StepGuide$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StepGuide"], {
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
            artifacts.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    marginTop: "40px"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
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
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                            gap: "12px"
                        },
                        children: artifacts.map((a)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                style: {
                                    background: "var(--bg-card)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "10px",
                                    overflow: "hidden"
                                },
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
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
            showCelebration && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$components$2f$CelebrationOverlay$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CelebrationOverlay"], {
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
_s(MissionPage, "UWaDDO5/PU8+roBOJ22U94RYhRg=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$creative$2d$lab$2f$lib$2f$stores$2f$progress$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useProgressStore"]
    ];
});
_c = MissionPage;
var _c;
__turbopack_context__.k.register(_c, "MissionPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/navigation.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = __turbopack_context__.r("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/client/components/navigation.js [app-client] (ecmascript)");
}),
"[project]/node_modules/.bun/zustand@5.0.12+26a211c426f3f87c/node_modules/zustand/esm/vanilla.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createStore",
    ()=>createStore
]);
const createStoreImpl = (createState)=>{
    let state;
    const listeners = /* @__PURE__ */ new Set();
    const setState = (partial, replace)=>{
        const nextState = typeof partial === "function" ? partial(state) : partial;
        if (!Object.is(nextState, state)) {
            const previousState = state;
            state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
            listeners.forEach((listener)=>listener(state, previousState));
        }
    };
    const getState = ()=>state;
    const getInitialState = ()=>initialState;
    const subscribe = (listener)=>{
        listeners.add(listener);
        return ()=>listeners.delete(listener);
    };
    const api = {
        setState,
        getState,
        getInitialState,
        subscribe
    };
    const initialState = state = createState(setState, getState, api);
    return api;
};
const createStore = (createState)=>createState ? createStoreImpl(createState) : createStoreImpl;
;
}),
"[project]/node_modules/.bun/zustand@5.0.12+26a211c426f3f87c/node_modules/zustand/esm/react.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "create",
    ()=>create,
    "useStore",
    ()=>useStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@16.2.2+8a3d1a74e471f9f3/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/zustand@5.0.12+26a211c426f3f87c/node_modules/zustand/esm/vanilla.mjs [app-client] (ecmascript)");
;
;
const identity = (arg)=>arg;
function useStore(api, selector = identity) {
    const slice = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useSyncExternalStore(api.subscribe, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "useStore.useSyncExternalStore[slice]": ()=>selector(api.getState())
    }["useStore.useSyncExternalStore[slice]"], [
        api,
        selector
    ]), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "useStore.useSyncExternalStore[slice]": ()=>selector(api.getInitialState())
    }["useStore.useSyncExternalStore[slice]"], [
        api,
        selector
    ]));
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$16$2e$2$2e$2$2b$8a3d1a74e471f9f3$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useDebugValue(slice);
    return slice;
}
const createImpl = (createState)=>{
    const api = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zustand$40$5$2e$0$2e$12$2b$26a211c426f3f87c$2f$node_modules$2f$zustand$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createStore"])(createState);
    const useBoundStore = (selector)=>useStore(api, selector);
    Object.assign(useBoundStore, api);
    return useBoundStore;
};
const create = (createState)=>createState ? createImpl(createState) : createImpl;
;
}),
"[project]/node_modules/.bun/zustand@5.0.12+26a211c426f3f87c/node_modules/zustand/esm/middleware.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "combine",
    ()=>combine,
    "createJSONStorage",
    ()=>createJSONStorage,
    "devtools",
    ()=>devtools,
    "persist",
    ()=>persist,
    "redux",
    ()=>redux,
    "subscribeWithSelector",
    ()=>subscribeWithSelector,
    "unstable_ssrSafe",
    ()=>ssrSafe
]);
const __TURBOPACK__import$2e$meta__ = {
    get url () {
        return `file://${__turbopack_context__.P("node_modules/.bun/zustand@5.0.12+26a211c426f3f87c/node_modules/zustand/esm/middleware.mjs")}`;
    },
    get turbopackHot () {
        return __turbopack_context__.m.hot;
    }
};
const reduxImpl = (reducer, initial)=>(set, _get, api)=>{
        api.dispatch = (action)=>{
            set((state)=>reducer(state, action), false, action);
            return action;
        };
        api.dispatchFromDevtools = true;
        return {
            dispatch: (...args)=>api.dispatch(...args),
            ...initial
        };
    };
const redux = reduxImpl;
const shouldDispatchFromDevtools = (api)=>!!api.dispatchFromDevtools && typeof api.dispatch === "function";
const trackedConnections = /* @__PURE__ */ new Map();
const getTrackedConnectionState = (name)=>{
    const api = trackedConnections.get(name);
    if (!api) return {};
    return Object.fromEntries(Object.entries(api.stores).map(([key, api2])=>[
            key,
            api2.getState()
        ]));
};
const extractConnectionInformation = (store, extensionConnector, options)=>{
    if (store === void 0) {
        return {
            type: "untracked",
            connection: extensionConnector.connect(options)
        };
    }
    const existingConnection = trackedConnections.get(options.name);
    if (existingConnection) {
        return {
            type: "tracked",
            store,
            ...existingConnection
        };
    }
    const newConnection = {
        connection: extensionConnector.connect(options),
        stores: {}
    };
    trackedConnections.set(options.name, newConnection);
    return {
        type: "tracked",
        store,
        ...newConnection
    };
};
const removeStoreFromTrackedConnections = (name, store)=>{
    if (store === void 0) return;
    const connectionInfo = trackedConnections.get(name);
    if (!connectionInfo) return;
    delete connectionInfo.stores[store];
    if (Object.keys(connectionInfo.stores).length === 0) {
        trackedConnections.delete(name);
    }
};
const findCallerName = (stack)=>{
    var _a, _b;
    if (!stack) return void 0;
    const traceLines = stack.split("\n");
    const apiSetStateLineIndex = traceLines.findIndex((traceLine)=>traceLine.includes("api.setState"));
    if (apiSetStateLineIndex < 0) return void 0;
    const callerLine = ((_a = traceLines[apiSetStateLineIndex + 1]) == null ? void 0 : _a.trim()) || "";
    return (_b = /.+ (.+) .+/.exec(callerLine)) == null ? void 0 : _b[1];
};
const devtoolsImpl = (fn, devtoolsOptions = {})=>(set, get, api)=>{
        const { enabled, anonymousActionType, store, ...options } = devtoolsOptions;
        let extensionConnector;
        try {
            extensionConnector = (enabled != null ? enabled : (__TURBOPACK__import$2e$meta__.env ? __TURBOPACK__import$2e$meta__.env.MODE : void 0) !== "production") && window.__REDUX_DEVTOOLS_EXTENSION__;
        } catch (e) {}
        if (!extensionConnector) {
            return fn(set, get, api);
        }
        const { connection, ...connectionInformation } = extractConnectionInformation(store, extensionConnector, options);
        let isRecording = true;
        api.setState = (state, replace, nameOrAction)=>{
            const r = set(state, replace);
            if (!isRecording) return r;
            const action = nameOrAction === void 0 ? {
                type: anonymousActionType || findCallerName(new Error().stack) || "anonymous"
            } : typeof nameOrAction === "string" ? {
                type: nameOrAction
            } : nameOrAction;
            if (store === void 0) {
                connection == null ? void 0 : connection.send(action, get());
                return r;
            }
            connection == null ? void 0 : connection.send({
                ...action,
                type: `${store}/${action.type}`
            }, {
                ...getTrackedConnectionState(options.name),
                [store]: api.getState()
            });
            return r;
        };
        api.devtools = {
            cleanup: ()=>{
                if (connection && typeof connection.unsubscribe === "function") {
                    connection.unsubscribe();
                }
                removeStoreFromTrackedConnections(options.name, store);
            }
        };
        const setStateFromDevtools = (...a)=>{
            const originalIsRecording = isRecording;
            isRecording = false;
            set(...a);
            isRecording = originalIsRecording;
        };
        const initialState = fn(api.setState, get, api);
        if (connectionInformation.type === "untracked") {
            connection == null ? void 0 : connection.init(initialState);
        } else {
            connectionInformation.stores[connectionInformation.store] = api;
            connection == null ? void 0 : connection.init(Object.fromEntries(Object.entries(connectionInformation.stores).map(([key, store2])=>[
                    key,
                    key === connectionInformation.store ? initialState : store2.getState()
                ])));
        }
        if (shouldDispatchFromDevtools(api)) {
            let didWarnAboutReservedActionType = false;
            const originalDispatch = api.dispatch;
            api.dispatch = (...args)=>{
                if ((__TURBOPACK__import$2e$meta__.env ? __TURBOPACK__import$2e$meta__.env.MODE : void 0) !== "production" && args[0].type === "__setState" && !didWarnAboutReservedActionType) {
                    console.warn('[zustand devtools middleware] "__setState" action type is reserved to set state from the devtools. Avoid using it.');
                    didWarnAboutReservedActionType = true;
                }
                originalDispatch(...args);
            };
        }
        connection.subscribe((message)=>{
            var _a;
            switch(message.type){
                case "ACTION":
                    if (typeof message.payload !== "string") {
                        console.error("[zustand devtools middleware] Unsupported action format");
                        return;
                    }
                    return parseJsonThen(message.payload, (action)=>{
                        if (action.type === "__setState") {
                            if (store === void 0) {
                                setStateFromDevtools(action.state);
                                return;
                            }
                            if (Object.keys(action.state).length !== 1) {
                                console.error(`
                    [zustand devtools middleware] Unsupported __setState action format.
                    When using 'store' option in devtools(), the 'state' should have only one key, which is a value of 'store' that was passed in devtools(),
                    and value of this only key should be a state object. Example: { "type": "__setState", "state": { "abc123Store": { "foo": "bar" } } }
                    `);
                            }
                            const stateFromDevtools = action.state[store];
                            if (stateFromDevtools === void 0 || stateFromDevtools === null) {
                                return;
                            }
                            if (JSON.stringify(api.getState()) !== JSON.stringify(stateFromDevtools)) {
                                setStateFromDevtools(stateFromDevtools);
                            }
                            return;
                        }
                        if (shouldDispatchFromDevtools(api)) {
                            api.dispatch(action);
                        }
                    });
                case "DISPATCH":
                    switch(message.payload.type){
                        case "RESET":
                            setStateFromDevtools(initialState);
                            if (store === void 0) {
                                return connection == null ? void 0 : connection.init(api.getState());
                            }
                            return connection == null ? void 0 : connection.init(getTrackedConnectionState(options.name));
                        case "COMMIT":
                            if (store === void 0) {
                                connection == null ? void 0 : connection.init(api.getState());
                                return;
                            }
                            return connection == null ? void 0 : connection.init(getTrackedConnectionState(options.name));
                        case "ROLLBACK":
                            return parseJsonThen(message.state, (state)=>{
                                if (store === void 0) {
                                    setStateFromDevtools(state);
                                    connection == null ? void 0 : connection.init(api.getState());
                                    return;
                                }
                                setStateFromDevtools(state[store]);
                                connection == null ? void 0 : connection.init(getTrackedConnectionState(options.name));
                            });
                        case "JUMP_TO_STATE":
                        case "JUMP_TO_ACTION":
                            return parseJsonThen(message.state, (state)=>{
                                if (store === void 0) {
                                    setStateFromDevtools(state);
                                    return;
                                }
                                if (JSON.stringify(api.getState()) !== JSON.stringify(state[store])) {
                                    setStateFromDevtools(state[store]);
                                }
                            });
                        case "IMPORT_STATE":
                            {
                                const { nextLiftedState } = message.payload;
                                const lastComputedState = (_a = nextLiftedState.computedStates.slice(-1)[0]) == null ? void 0 : _a.state;
                                if (!lastComputedState) return;
                                if (store === void 0) {
                                    setStateFromDevtools(lastComputedState);
                                } else {
                                    setStateFromDevtools(lastComputedState[store]);
                                }
                                connection == null ? void 0 : connection.send(null, // FIXME no-any
                                nextLiftedState);
                                return;
                            }
                        case "PAUSE_RECORDING":
                            return isRecording = !isRecording;
                    }
                    return;
            }
        });
        return initialState;
    };
const devtools = devtoolsImpl;
const parseJsonThen = (stringified, fn)=>{
    let parsed;
    try {
        parsed = JSON.parse(stringified);
    } catch (e) {
        console.error("[zustand devtools middleware] Could not parse the received json", e);
    }
    if (parsed !== void 0) fn(parsed);
};
const subscribeWithSelectorImpl = (fn)=>(set, get, api)=>{
        const origSubscribe = api.subscribe;
        api.subscribe = (selector, optListener, options)=>{
            let listener = selector;
            if (optListener) {
                const equalityFn = (options == null ? void 0 : options.equalityFn) || Object.is;
                let currentSlice = selector(api.getState());
                listener = (state)=>{
                    const nextSlice = selector(state);
                    if (!equalityFn(currentSlice, nextSlice)) {
                        const previousSlice = currentSlice;
                        optListener(currentSlice = nextSlice, previousSlice);
                    }
                };
                if (options == null ? void 0 : options.fireImmediately) {
                    optListener(currentSlice, currentSlice);
                }
            }
            return origSubscribe(listener);
        };
        const initialState = fn(set, get, api);
        return initialState;
    };
const subscribeWithSelector = subscribeWithSelectorImpl;
function combine(initialState, create) {
    return (...args)=>Object.assign({}, initialState, create(...args));
}
function createJSONStorage(getStorage, options) {
    let storage;
    try {
        storage = getStorage();
    } catch (e) {
        return;
    }
    const persistStorage = {
        getItem: (name)=>{
            var _a;
            const parse = (str2)=>{
                if (str2 === null) {
                    return null;
                }
                return JSON.parse(str2, options == null ? void 0 : options.reviver);
            };
            const str = (_a = storage.getItem(name)) != null ? _a : null;
            if (str instanceof Promise) {
                return str.then(parse);
            }
            return parse(str);
        },
        setItem: (name, newValue)=>storage.setItem(name, JSON.stringify(newValue, options == null ? void 0 : options.replacer)),
        removeItem: (name)=>storage.removeItem(name)
    };
    return persistStorage;
}
const toThenable = (fn)=>(input)=>{
        try {
            const result = fn(input);
            if (result instanceof Promise) {
                return result;
            }
            return {
                then (onFulfilled) {
                    return toThenable(onFulfilled)(result);
                },
                catch (_onRejected) {
                    return this;
                }
            };
        } catch (e) {
            return {
                then (_onFulfilled) {
                    return this;
                },
                catch (onRejected) {
                    return toThenable(onRejected)(e);
                }
            };
        }
    };
const persistImpl = (config, baseOptions)=>(set, get, api)=>{
        let options = {
            storage: createJSONStorage(()=>window.localStorage),
            partialize: (state)=>state,
            version: 0,
            merge: (persistedState, currentState)=>({
                    ...currentState,
                    ...persistedState
                }),
            ...baseOptions
        };
        let hasHydrated = false;
        let hydrationVersion = 0;
        const hydrationListeners = /* @__PURE__ */ new Set();
        const finishHydrationListeners = /* @__PURE__ */ new Set();
        let storage = options.storage;
        if (!storage) {
            return config((...args)=>{
                console.warn(`[zustand persist middleware] Unable to update item '${options.name}', the given storage is currently unavailable.`);
                set(...args);
            }, get, api);
        }
        const setItem = ()=>{
            const state = options.partialize({
                ...get()
            });
            return storage.setItem(options.name, {
                state,
                version: options.version
            });
        };
        const savedSetState = api.setState;
        api.setState = (state, replace)=>{
            savedSetState(state, replace);
            return setItem();
        };
        const configResult = config((...args)=>{
            set(...args);
            return setItem();
        }, get, api);
        api.getInitialState = ()=>configResult;
        let stateFromStorage;
        const hydrate = ()=>{
            var _a, _b;
            if (!storage) return;
            const currentVersion = ++hydrationVersion;
            hasHydrated = false;
            hydrationListeners.forEach((cb)=>{
                var _a2;
                return cb((_a2 = get()) != null ? _a2 : configResult);
            });
            const postRehydrationCallback = ((_b = options.onRehydrateStorage) == null ? void 0 : _b.call(options, (_a = get()) != null ? _a : configResult)) || void 0;
            return toThenable(storage.getItem.bind(storage))(options.name).then((deserializedStorageValue)=>{
                if (deserializedStorageValue) {
                    if (typeof deserializedStorageValue.version === "number" && deserializedStorageValue.version !== options.version) {
                        if (options.migrate) {
                            const migration = options.migrate(deserializedStorageValue.state, deserializedStorageValue.version);
                            if (migration instanceof Promise) {
                                return migration.then((result)=>[
                                        true,
                                        result
                                    ]);
                            }
                            return [
                                true,
                                migration
                            ];
                        }
                        console.error(`State loaded from storage couldn't be migrated since no migrate function was provided`);
                    } else {
                        return [
                            false,
                            deserializedStorageValue.state
                        ];
                    }
                }
                return [
                    false,
                    void 0
                ];
            }).then((migrationResult)=>{
                var _a2;
                if (currentVersion !== hydrationVersion) {
                    return;
                }
                const [migrated, migratedState] = migrationResult;
                stateFromStorage = options.merge(migratedState, (_a2 = get()) != null ? _a2 : configResult);
                set(stateFromStorage, true);
                if (migrated) {
                    return setItem();
                }
            }).then(()=>{
                if (currentVersion !== hydrationVersion) {
                    return;
                }
                postRehydrationCallback == null ? void 0 : postRehydrationCallback(get(), void 0);
                stateFromStorage = get();
                hasHydrated = true;
                finishHydrationListeners.forEach((cb)=>cb(stateFromStorage));
            }).catch((e)=>{
                if (currentVersion !== hydrationVersion) {
                    return;
                }
                postRehydrationCallback == null ? void 0 : postRehydrationCallback(void 0, e);
            });
        };
        api.persist = {
            setOptions: (newOptions)=>{
                options = {
                    ...options,
                    ...newOptions
                };
                if (newOptions.storage) {
                    storage = newOptions.storage;
                }
            },
            clearStorage: ()=>{
                storage == null ? void 0 : storage.removeItem(options.name);
            },
            getOptions: ()=>options,
            rehydrate: ()=>hydrate(),
            hasHydrated: ()=>hasHydrated,
            onHydrate: (cb)=>{
                hydrationListeners.add(cb);
                return ()=>{
                    hydrationListeners.delete(cb);
                };
            },
            onFinishHydration: (cb)=>{
                finishHydrationListeners.add(cb);
                return ()=>{
                    finishHydrationListeners.delete(cb);
                };
            }
        };
        if (!options.skipHydration) {
            hydrate();
        }
        return stateFromStorage || configResult;
    };
const persist = persistImpl;
function ssrSafe(config, isSSR = typeof window === "undefined") {
    return (set, get, api)=>{
        if (!isSSR) {
            return config(set, get, api);
        }
        const ssrSet = ()=>{
            throw new Error("Cannot set state of Zustand store in SSR");
        };
        api.setState = ssrSet;
        return config(ssrSet, get, api);
    };
}
;
}),
]);

//# sourceMappingURL=_122_ets._.js.map